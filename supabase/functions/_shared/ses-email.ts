interface EmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Sleep utility for retry delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Convert string to Uint8Array
function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Convert ArrayBuffer to hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// HMAC-SHA256 using Web Crypto API
async function hmac(key: Uint8Array | string, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    typeof key === "string" ? stringToUint8Array(key) : key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    stringToUint8Array(data)
  );
  
  return new Uint8Array(signature);
}

// SHA-256 using Web Crypto API
async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    stringToUint8Array(data)
  );
  return bufferToHex(hash);
}

// AWS SES API signature v4
async function createSignature(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
  stringToSign: string
): Promise<string> {
  const kDate = await hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = await hmac(kSigning, stringToSign);
  
  return bufferToHex(signature);
}

/**
 * Send email using AWS SES with automatic retry logic
 * 
 * @param params - Email parameters (to, subject, html, optional text and replyTo)
 * @returns Promise with result indicating success/failure and messageId or error
 */
export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  // Validate parameters
  if (!params.to || (Array.isArray(params.to) && params.to.length === 0)) {
    return { success: false, error: "No recipient specified" };
  }
  
  if (!params.subject) {
    return { success: false, error: "Subject is required" };
  }
  
  if (!params.html) {
    return { success: false, error: "HTML content is required" };
  }

  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_SES_REGION") || "us-east-1";
  const fromEmail = Deno.env.get("AWS_SES_FROM_EMAIL") || "noreply@tutor-flow.app";
  const fromName = Deno.env.get("AWS_SES_FROM_NAME") || "Tutor Flow";

  if (!accessKeyId || !secretAccessKey) {
    return { success: false, error: "AWS credentials not configured" };
  }

  const fromAddress = `${fromName} <${fromEmail}>`;
  const recipients = Array.isArray(params.to) ? params.to : [params.to];

  // Retry logic
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📧 [SES] Sending email (attempt ${attempt}/${MAX_RETRIES})`, {
        to: recipients,
        subject: params.subject,
      });

      // Prepare SES API request using AWS Signature V4
      const service = "ses";
      const host = `email.${region}.amazonaws.com`;
      const endpoint = `https://${host}/`;
      
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
      const dateStamp = amzDate.substring(0, 8);

      // Build the email body
      const destinations = recipients.map(email => `<Destination><ToAddresses><member>${email}</member></ToAddresses></Destination>`).join("");
      const body = `Action=SendEmail&Source=${encodeURIComponent(fromAddress)}&Message.Subject.Data=${encodeURIComponent(params.subject)}&Message.Body.Html.Data=${encodeURIComponent(params.html)}${params.text ? `&Message.Body.Text.Data=${encodeURIComponent(params.text)}` : ""}${recipients.map((email, i) => `&Destination.ToAddresses.member.${i + 1}=${encodeURIComponent(email)}`).join("")}${params.replyTo ? `&ReplyToAddresses.member.1=${encodeURIComponent(params.replyTo)}` : ""}`;

      const payloadHash = await sha256(body);

      // Create canonical request
      const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = "content-type;host;x-amz-date";
      const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      // Create string to sign
      const algorithm = "AWS4-HMAC-SHA256";
      const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
      const canonicalRequestHash = await sha256(canonicalRequest);
      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

      // Calculate signature
      const signature = await createSignature(secretAccessKey, dateStamp, region, service, stringToSign);

      // Create authorization header
      const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      // Make the request
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Amz-Date": amzDate,
          "Authorization": authorizationHeader,
        },
        body: body,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SES API error: ${response.status} - ${errorText}`);
      }

      const responseText = await response.text();
      
      // Extract MessageId from XML response
      const messageIdMatch = responseText.match(/<MessageId>(.*?)<\/MessageId>/);
      const messageId = messageIdMatch ? messageIdMatch[1] : "unknown";

      console.log(`✅ [SES] Email sent successfully`, {
        messageId,
        to: recipients,
      });

      return {
        success: true,
        messageId,
      };
      
    } catch (error) {
      lastError = error as Error;
      
      console.error(`❌ [SES] Attempt ${attempt} failed:`, {
        error: lastError.message,
        to: recipients,
      });

      // If not the last attempt, wait before retrying
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt; // Progressive backoff
        console.log(`⏳ [SES] Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }

  // All retries failed
  const errorMessage = lastError?.message || "Unknown error sending email";
  console.error(`💥 [SES] All ${MAX_RETRIES} attempts failed:`, {
    error: errorMessage,
    to: recipients,
  });

  return {
    success: false,
    error: errorMessage,
  };
}
