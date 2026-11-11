import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
export function Choice({
  id,
  label,
  value,
  onChange,
  choices,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  choices: readonly (readonly [string, string])[];
  disabled?: boolean;
}) {
  return (
    <div className="choice">
      <label htmlFor={id}>{label}</label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {choices.map(([value, title]) => (
          <NativeSelectOption key={value} value={value}>
            {title}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
