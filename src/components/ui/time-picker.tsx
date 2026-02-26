import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";


interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  id?: string;
}

export function TimePicker({
  value,
  onChange,
  className,
  id,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value || "");

  // Sync input value when external value changes
  React.useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  // Parse hours/minutes for display
  const [hours, minutes] = value ? value.split(":").map(Number) : [NaN, NaN];
  const hasValue = !isNaN(hours) && !isNaN(minutes);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9]/g, "");

    if (raw.length > 4) raw = raw.slice(0, 4);

    let formatted = raw;
    if (raw.length >= 3) {
      formatted = raw.slice(0, 2) + ":" + raw.slice(2);
    }

    setInputValue(formatted);

    // Auto-commit when we have a valid HH:MM
    if (raw.length === 4) {
      const h = parseInt(raw.slice(0, 2), 10);
      const m = parseInt(raw.slice(2, 4), 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        onChange(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
      }
    }
  };

  const handleInputBlur = () => {
    // Try to parse on blur
    const parts = inputValue.split(":");
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        const formatted = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        onChange(formatted);
        setInputValue(formatted);
        return;
      }
    }
    // Reset to last valid value
    setInputValue(value || "");
  };

  const handleHourChange = (newHour: number) => {
    const m = hasValue ? minutes : 0;
    onChange(`${newHour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  };

  const handleMinuteChange = (newMinute: number) => {
    const h = hasValue ? hours : 0;
    onChange(`${h.toString().padStart(2, "0")}:${newMinute.toString().padStart(2, "0")}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          id={id}
          className={cn(
            "flex items-center w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background cursor-pointer md:text-sm",
            "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            className
          )}
          onClick={() => setOpen(true)}
        >
          <Clock className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          <input
            type="text"
            inputMode="numeric"
            placeholder="HH:MM"
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onClick={(e) => e.stopPropagation()}
            onFocus={() => setOpen(false)}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
            maxLength={5}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 pointer-events-auto" align="start">
        <div className="flex px-3 py-2 gap-2 items-center">
          {/* Hour selector */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">Hora</span>
            <div className="h-[200px] w-full overflow-y-auto rounded-md">
              <div className="flex flex-col items-center py-1">
                {Array.from({ length: 24 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleHourChange(i)}
                    className={cn(
                      "w-full px-2 py-1.5 text-sm rounded-md transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      hasValue && hours === i
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground"
                    )}
                  >
                    {i.toString().padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="text-2xl font-light text-muted-foreground select-none">:</div>

          {/* Minute selector - 0 to 59 */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">Min</span>
            <div className="h-[200px] w-full overflow-y-auto rounded-md">
              <div className="flex flex-col items-center py-1">
                {Array.from({ length: 60 }, (_, m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinuteChange(m)}
                    className={cn(
                      "w-full px-2 py-1.5 text-sm rounded-md transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      hasValue && minutes === m
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground"
                    )}
                  >
                    {m.toString().padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
