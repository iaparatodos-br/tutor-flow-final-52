import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Formats a number to BRL currency display (e.g., "1.234,56")
 */
function formatToBRL(value: number): string {
  if (value === 0) return "";
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formattedInt},${decPart}`;
}

/**
 * Parses a BRL-formatted string back to number
 */
function parseBRL(raw: string): number {
  // Remove everything except digits and comma
  const cleaned = raw.replace(/[^\d,]/g, "");
  if (!cleaned) return 0;
  // Replace comma with dot for parseFloat
  const normalized = cleaned.replace(",", ".");
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
}

const CurrencyInput = React.forwardRef<HTMLDivElement, CurrencyInputProps>(
  (
    {
      value,
      onChange,
      step = 1,
      min = 0,
      max = 999999.99,
      placeholder = "0,00",
      className,
      disabled = false,
    },
    ref
  ) => {
    const [displayValue, setDisplayValue] = React.useState(() =>
      value > 0 ? formatToBRL(value) : ""
    );
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Sync display when value changes externally (e.g., form reset)
    React.useEffect(() => {
      if (document.activeElement !== inputRef.current) {
        setDisplayValue(value > 0 ? formatToBRL(value) : "");
      }
    }, [value]);

    const clamp = (v: number) => Math.min(max, Math.max(min, v));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow only digits, comma, and dot
      const sanitized = raw.replace(/[^\d.,]/g, "");
      setDisplayValue(sanitized);
      const parsed = parseBRL(sanitized);
      onChange(clamp(parsed));
    };

    const handleBlur = () => {
      // Re-format on blur
      setDisplayValue(value > 0 ? formatToBRL(value) : "");
    };

    const handleFocus = () => {
      // On focus, show raw value for easy editing
      if (value > 0) {
        const raw = formatToBRL(value);
        setDisplayValue(raw);
      }
    };

    const increment = () => {
      if (disabled) return;
      const newVal = clamp(Math.round((value + step) * 100) / 100);
      onChange(newVal);
      setDisplayValue(formatToBRL(newVal));
    };

    const decrement = () => {
      if (disabled) return;
      const newVal = clamp(Math.round((value - step) * 100) / 100);
      onChange(newVal);
      setDisplayValue(newVal > 0 ? formatToBRL(newVal) : "");
    };

    const handleWheel = (e: React.WheelEvent) => {
      if (disabled) return;
      if (document.activeElement !== inputRef.current) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        increment();
      } else {
        decrement();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        increment();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        decrement();
      }
    };

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        {/* R$ prefix */}
        <span className="pl-3 text-sm text-muted-foreground select-none">
          R$
        </span>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 h-10 bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
        />

        {/* Arrow buttons */}
        <div className="flex flex-col border-l border-input">
          <button
            type="button"
            tabIndex={-1}
            onClick={increment}
            disabled={disabled}
            className="flex h-5 w-7 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors rounded-tr-md disabled:pointer-events-none"
            aria-label="Incrementar valor"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={decrement}
            disabled={disabled}
            className="flex h-5 w-7 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors rounded-br-md disabled:pointer-events-none"
            aria-label="Decrementar valor"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
