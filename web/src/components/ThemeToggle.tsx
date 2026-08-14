import { useTheme, type Theme } from "../theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "Auto" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();

  return (
    <div role="group" aria-label="Theme" className="flex gap-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          onClick={() => setTheme(option.value)}
          aria-pressed={theme === option.value}
          className={`rounded px-1.5 py-1 font-mono text-[10px] tracking-[0.14em] uppercase transition ${
            theme === option.value ? "text-accent" : "text-faint hover:text-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
