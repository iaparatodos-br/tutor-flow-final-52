import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  id?: string;
  intervalMinutes?: number;
}

function generateTimeSlots(interval: number) {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += interval) {
      slots.push(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`
      );
    }
  }
  return slots;
}

export function TimePicker({
  value,
  onChange,
  className,
  id,
  intervalMinutes = 15,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const slots = React.useMemo(() => generateTimeSlots(intervalMinutes), [intervalMinutes]);
  const selectedRef = React.useRef<HTMLButtonElement>(null);

  // Parse hours/minutes for display
  const [hours, minutes] = value ? value.split(":").map(Number) : [NaN, NaN];
  const hasValue = !isNaN(hours) && !isNaN(minutes);
  const displayValue = hasValue
    ? `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
    : "";

  // Scroll to selected time when popover opens
  React.useEffect(() => {
    if (open && selectedRef.current) {
      setTimeout(() => {
        selectedRef.current?.scrollIntoView({ block: "center" });
      }, 50);
    }
  }, [open]);

  const handleSelect = (slot: string) => {
    onChange(slot);
    setOpen(false);
  };

  // Allow manual input via hours/minutes selectors
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
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-start text-left font-normal h-10",
            !hasValue && "text-muted-foreground",
            className
          )}
        >
          <Clock className="mr-2 h-4 w-4 shrink-0 opacity-60" />
          {displayValue || "HH:MM"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 pointer-events-auto" align="start">
        <div className="flex border-b px-3 py-2 gap-2 items-center">
          {/* Hour selector */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">Hora</span>
            <ScrollArea className="h-[180px] w-full rounded-md">
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
            </ScrollArea>
          </div>

          <div className="text-2xl font-light text-muted-foreground select-none">:</div>

          {/* Minute selector */}
          <div className="flex flex-col items-center flex-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">Min</span>
            <ScrollArea className="h-[180px] w-full rounded-md">
              <div className="flex flex-col items-center py-1">
                {Array.from({ length: 60 / intervalMinutes }, (_, i) => i * intervalMinutes).map(
                  (m) => (
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
                  )
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Quick slots */}
        <div className="p-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1 font-medium">
            Horários rápidos
          </p>
          <div className="grid grid-cols-4 gap-1">
            {["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"].map(
              (slot) => (
                <button
                  key={slot}
                  type="button"
                  ref={value === slot ? selectedRef : undefined}
                  onClick={() => handleSelect(slot)}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded-md transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    value === slot
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-foreground border border-border"
                  )}
                >
                  {slot}
                </button>
              )
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
