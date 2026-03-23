import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

const SPECIALISMS = [
  "Complex Care",
  "Paediatric",
  "Mental Health",
  "Learning Disabilities",
  "End of Life",
  "Ventilation",
  "Tracheostomy",
  "PEG/NG Feeding",
  "Epilepsy",
  "Spinal Injury",
  "Acquired Brain Injury",
  "Palliative Care",
  "Diabetes Management",
  "Wound Care",
  "Catheter Care",
  "Stoma Care",
];

interface SpecialismSelectorProps {
  selected: string[];
  onChange: (specialisms: string[]) => void;
  testIdPrefix?: string;
}

export function SpecialismSelector({ selected, onChange, testIdPrefix }: SpecialismSelectorProps) {
  const toggle = (specialism: string) => {
    if (selected.includes(specialism)) {
      onChange(selected.filter((s) => s !== specialism));
    } else {
      onChange([...selected, specialism]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {SPECIALISMS.map((specialism) => {
        const isSelected = selected.includes(specialism);
        return (
          <Badge
            key={specialism}
            variant={isSelected ? "default" : "outline"}
            className={`cursor-pointer select-none transition-colors ${
              isSelected
                ? "bg-primary text-primary-foreground hover:bg-primary/80"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
            onClick={() => toggle(specialism)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${specialism.toLowerCase().replace(/\s+/g, "-")}` : undefined}
          >
            {specialism}
            {isSelected && <X className="ml-1 h-3 w-3" />}
          </Badge>
        );
      })}
    </div>
  );
}
