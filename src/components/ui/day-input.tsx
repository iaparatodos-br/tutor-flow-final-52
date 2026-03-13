import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";

interface DayInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  required?: boolean;
}

const DayInput = React.forwardRef<HTMLDivElement, DayInputProps>(
  (
    {
      value,
      onChange,
      min = 1,
      max = 28,
      placeholder = "15",
      className,
      disabled = false,
      id,
      required,
    },
    ref
  ) => {
    const [displayValue, setDisplayValue] = React.useState(() =>
      value ? String(value) : ""
    );
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
      if (document.activeElement !== inputRef.current) {
        setDisplayValue(value ? String(value) : "");
      }
    }, [value]);

    const clamp = (v: number) => Math.min(max, Math.max(min, v));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d]/g, "");
      setDisplayValue(raw);

      if (raw === "") return; // allow empty while typing

      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed)) {
        onChange(clamp(parsed));
      }
    };

    const handleBlur = () => {
      if (!displayValue || displayValue === "") {
        setDisplayValue(value ? String(value) : "");
      } else {
        const parsed = parseInt(displayValue, 10);
        if (!isNaN(parsed)) {
          const clamped = clamp(parsed);
          onChange(clamped);
          setDisplayValue(String(clamped));
        } else {
          setDisplayValue(value ? String(value) : "");
        }
      }
    };

    const increment = () => {
      if (disabled) return;
      const current = value || min;
      const newVal = current >= max ? min : current + 1;
      onChange(newVal);
      setDisplayValue(String(newVal));
    };

    const decrement = () => {
      if (disabled) return;
      const current = value || min;
      const newVal = current <= min ? max : current - 1;
      onChange(newVal);
      setDisplayValue(String(newVal));
    };

    const handleWheel = (e: React.WheelEvent) => {
      if (disabled) return;
      if (document.activeElement !== inputRef.current) return;
      e.preventDefault();
      if (e.deltaY < 0) increment();
      else decrement();
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
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="flex-1 h-10 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
        />

        <div className="flex flex-col border-l border-input">
          <button
            type="button"
            tabIndex={-1}
            onClick={increment}
            disabled={disabled}
            className="flex h-5 w-7 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors rounded-tr-md disabled:pointer-events-none"
            aria-label="Próximo dia"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={decrement}
            disabled={disabled}
            className="flex h-5 w-7 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors rounded-br-md disabled:pointer-events-none"
            aria-label="Dia anterior"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }
);

DayInput.displayName = "DayInput";

export { DayInput };
