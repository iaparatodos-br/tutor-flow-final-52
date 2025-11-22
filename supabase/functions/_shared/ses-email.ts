import { SESClient, SendEmailCommand } from "npm:@aws-sdk/client-ses@^3.0.0";

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

// Initialize SES client with credentials from environment
function createSESClient(): SESClient {
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_SES_REGION") || "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY");
  }

  return new SESClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

// Sleep utility for retry delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

  const fromEmail = Deno.env.get("AWS_SES_FROM_EMAIL") || "noreply@tutor-flow.app";
  const fromName = Deno.env.get("AWS_SES_FROM_NAME") || "Tutor Flow";
  const fromAddress = `${fromName} <${fromEmail}>`;

  // Normalize recipients to array
  const recipients = Array.isArray(params.to) ? params.to : [params.to];

  // Prepare email command
  const command = new SendEmailCommand({
    Source: fromAddress,
    Destination: {
      ToAddresses: recipients,
    },
    Message: {
      Subject: {
        Data: params.subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: params.html,
          Charset: "UTF-8",
        },
        ...(params.text && {
          Text: {
            Data: params.text,
            Charset: "UTF-8",
          },
        }),
      },
    },
    ...(params.replyTo && {
      ReplyToAddresses: [params.replyTo],
    }),
  });

  // Retry logic
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`📧 [SES] Sending email (attempt ${attempt}/${MAX_RETRIES})`, {
        to: recipients,
        subject: params.subject,
      });

      const client = createSESClient();
      const response = await client.send(command);

      console.log(`✅ [SES] Email sent successfully`, {
        messageId: response.MessageId,
        to: recipients,
      });

      return {
        success: true,
        messageId: response.MessageId,
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
