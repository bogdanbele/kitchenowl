import { ThemeToggle } from "../../components/ThemeToggle";
import { SettingsPage } from "./SettingsPage";

export default function AppearanceSettings() {
  return (
    <SettingsPage
      title="Appearance"
      intro="Stored in this browser, so a phone can sit on dark while the kitchen tablet stays light."
    >
      <div className="-ml-1.5">
        <ThemeToggle />
      </div>
    </SettingsPage>
  );
}
