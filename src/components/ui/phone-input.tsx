import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const COUNTRY_CODES = [
  { code: "+55", country: "BR", flag: "🇧🇷" },
  { code: "+1", country: "US", flag: "🇺🇸" },
  { code: "+351", country: "PT", flag: "🇵🇹" },
  { code: "+34", country: "ES", flag: "🇪🇸" },
  { code: "+44", country: "GB", flag: "🇬🇧" },
  { code: "+33", country: "FR", flag: "🇫🇷" },
  { code: "+49", country: "DE", flag: "🇩🇪" },
  { code: "+39", country: "IT", flag: "🇮🇹" },
  { code: "+81", country: "JP", flag: "🇯🇵" },
  { code: "+86", country: "CN", flag: "🇨🇳" },
  { code: "+91", country: "IN", flag: "🇮🇳" },
  { code: "+54", country: "AR", flag: "🇦🇷" },
  { code: "+56", country: "CL", flag: "🇨🇱" },
  { code: "+57", country: "CO", flag: "🇨🇴" },
  { code: "+52", country: "MX", flag: "🇲🇽" },
  { code: "+598", country: "UY", flag: "🇺🇾" },
  { code: "+595", country: "PY", flag: "🇵🇾" },
] as const

interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "onChange"> {
  value?: string
  onChange?: (value: string) => void
}

function parsePhoneValue(value: string): { countryCode: string; number: string } {
  if (!value) return { countryCode: "+55", number: "" }

  // Try to match a country code prefix like "+55 " or "+1 "
  const match = value.match(/^\+(\d{1,3})\s*(.*)$/)
  if (match) {
    const prefix = `+${match[1]}`
    const found = COUNTRY_CODES.find(c => c.code === prefix)
    if (found) {
      return { countryCode: found.code, number: match[2] }
    }
    // Try longer prefixes first (e.g., +351 vs +3)
    for (const c of COUNTRY_CODES) {
      if (value.startsWith(c.code)) {
        const rest = value.slice(c.code.length).trim()
        return { countryCode: c.code, number: rest }
      }
    }
  }

  // No country code found - assume Brazil
  return { countryCode: "+55", number: value }
}

function formatBrazilianPhone(input: string): string {
  const numbers = input.replace(/\D/g, "")

  if (numbers.length === 0) return ""
  if (numbers.length <= 2) {
    return `(${numbers}`
  } else if (numbers.length <= 7) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`
  } else if (numbers.length <= 10) {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`
  } else {
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`
  }
}

function formatGenericPhone(input: string): string {
  return input.replace(/[^\d\s\-()]/g, "")
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value = "", onChange, ...props }, ref) => {
    const parsed = parsePhoneValue(value)
    const [countryCode, setCountryCode] = React.useState(parsed.countryCode)
    const [localNumber, setLocalNumber] = React.useState(parsed.number)

    // Sync from external value changes (e.g., when editing existing student)
    React.useEffect(() => {
      const parsed = parsePhoneValue(value)
      setCountryCode(parsed.countryCode)
      setLocalNumber(parsed.number)
    }, [value])

    const emitChange = (code: string, number: string) => {
      if (!number) {
        onChange?.("")
      } else {
        onChange?.(`${code} ${number}`)
      }
    }

    const handleCountryChange = (newCode: string) => {
      setCountryCode(newCode)
      // Re-format number if switching to/from Brazil
      if (newCode === "+55") {
        const formatted = formatBrazilianPhone(localNumber)
        setLocalNumber(formatted)
        emitChange(newCode, formatted)
      } else {
        const digits = localNumber.replace(/\D/g, "")
        setLocalNumber(digits)
        emitChange(newCode, digits)
      }
    }

    const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value
      let formatted: string

      if (countryCode === "+55") {
        formatted = formatBrazilianPhone(inputValue)
      } else {
        formatted = formatGenericPhone(inputValue)
      }

      setLocalNumber(formatted)
      emitChange(countryCode, formatted)
    }

    const isBrazil = countryCode === "+55"
    const currentCountry = COUNTRY_CODES.find(c => c.code === countryCode)

    return (
      <div className="flex gap-1.5">
        <Select value={countryCode} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-[100px] shrink-0">
            <SelectValue>
              {currentCountry ? `${currentCountry.flag} ${currentCountry.code}` : countryCode}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_CODES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.code} ({c.country})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          {...props}
          ref={ref}
          type="tel"
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={isBrazil ? "(11) 99999-9999" : "123456789"}
          maxLength={isBrazil ? 15 : 20}
          className={cn("flex-1", className)}
        />
      </div>
    )
  }
)

PhoneInput.displayName = "PhoneInput"

export { PhoneInput }
