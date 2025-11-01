import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CustomExpiryPickerProps {
  value: string; // "never" | "1h" | "24h" | "7d" | "30d" | ISO date string
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export function CustomExpiryPicker({ value, onChange, label, className }: CustomExpiryPickerProps) {
  const [isPreset, setIsPreset] = useState(() => {
    // Check if value is a preset or custom date
    return value === "never" || value === "1h" || value === "24h" || value === "7d" || value === "30d";
  });
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value && !isPreset ? new Date(value) : undefined
  );
  const [selectedTime, setSelectedTime] = useState<string>(() => {
    if (value && !isPreset) {
      const date = new Date(value);
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${hours}:${minutes}`;
    }
    return "23:59"; // Default to end of day
  });
  const [presetValue, setPresetValue] = useState<string>(
    isPreset ? value : "never"
  );

  const handlePresetChange = (newPreset: string) => {
    setPresetValue(newPreset);
    setIsPreset(true);
    setSelectedDate(undefined);
    onChange(newPreset);
  };

  const handleCustomDateSelect = (date: Date | undefined) => {
    if (date) {
      // Apply selected time to the date
      const [hours, minutes] = selectedTime.split(":").map(Number);
      date.setHours(hours, minutes, 0, 0);
      setSelectedDate(date);
      setIsPreset(false);
      onChange(date.toISOString());
    }
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    if (selectedDate) {
      const [hours, minutes] = time.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      
      // Validate that the combined date+time is in the future
      if (newDate <= new Date()) {
        // If in the past, set to current time + 1 hour
        const now = new Date();
        now.setHours(now.getHours() + 1);
        const futureHours = now.getHours().toString().padStart(2, "0");
        const futureMinutes = now.getMinutes().toString().padStart(2, "0");
        setSelectedTime(`${futureHours}:${futureMinutes}`);
        newDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
      }
      
      setSelectedDate(newDate);
      onChange(newDate.toISOString());
    }
  };

  // Update date when time changes (only if date is already selected)
  useEffect(() => {
    if (selectedDate && selectedTime && !isPreset) {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const newDate = new Date(selectedDate);
      newDate.setHours(hours, minutes, 0, 0);
      
      // Validate that the combined date+time is in the future
      if (newDate > new Date()) {
        // Only update if the time actually changed the date
        const currentTime = selectedDate.getTime();
        if (newDate.getTime() !== currentTime) {
          setSelectedDate(newDate);
          onChange(newDate.toISOString());
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTime]);

  const handleModeChange = (mode: "preset" | "custom") => {
    if (mode === "preset") {
      setIsPreset(true);
      onChange(presetValue);
      setSelectedDate(undefined);
    } else {
      setIsPreset(false);
      if (selectedDate) {
        onChange(selectedDate.toISOString());
      }
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label>{label}</Label>}
      
      {/* Mode Toggle */}
      <div className="flex gap-2 mb-2">
        <Button
          type="button"
          variant={isPreset ? "default" : "outline"}
          size="sm"
          onClick={() => handleModeChange("preset")}
          className="flex-1"
        >
          Preset
        </Button>
        <Button
          type="button"
          variant={!isPreset ? "default" : "outline"}
          size="sm"
          onClick={() => handleModeChange("custom")}
          className="flex-1"
        >
          Custom Date
        </Button>
      </div>

      {isPreset ? (
        <Select value={presetValue} onValueChange={handlePresetChange}>
          <SelectTrigger className="bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="never">Never expires</SelectItem>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="24h">24 hours</SelectItem>
            <SelectItem value="7d">7 days</SelectItem>
            <SelectItem value="30d">30 days</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal bg-background/50",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? (
                format(selectedDate, "PPP 'at' h:mm a")
              ) : (
                <span>Pick a date and time</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleCustomDateSelect}
              disabled={(date) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return date < today;
              }}
              initialFocus
            />
            {selectedDate && (
              <div className="p-3 border-t space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor="time-picker" className="flex items-center gap-2 text-sm font-normal">
                    <Clock className="h-4 w-4" />
                    Time:
                  </Label>
                  <Input
                    id="time-picker"
                    type="time"
                    value={selectedTime}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="w-auto"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Expires on {format(selectedDate, "PPP 'at' h:mm a")}
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

