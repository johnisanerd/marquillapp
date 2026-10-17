"use client";

import SchedulePicker from "./SchedulePicker";

/**
 * Chooses when the post goes out. The composer's single topbar button acts on
 * the choice: "Publish now", or "Schedule" for the picked time.
 */
export default function PostSchedulingControls({
  isBusy,
  scheduleMode,
  scheduleValue,
  onChange,
  onModeChange,
}: {
  isBusy: boolean;
  scheduleMode: boolean;
  scheduleValue: string;
  onChange: (value: string) => void;
  onModeChange: (value: boolean) => void;
}) {
  return (
    <div className="mq-card mq-create-schedule-card">
      <h2>When should this publish?</h2>
      <div className="mq-segmented mq-segmented-small" role="radiogroup" aria-label="Publishing time">
        <button type="button" role="radio" aria-checked={!scheduleMode} className={!scheduleMode ? "is-active" : ""} onClick={() => onModeChange(false)}>Right away</button>
        <button type="button" role="radio" aria-checked={scheduleMode} className={scheduleMode ? "is-active" : ""} onClick={() => onModeChange(true)}>Schedule for later</button>
      </div>
      {scheduleMode ? <SchedulePicker value={scheduleValue} onChange={onChange} disabled={isBusy} /> : null}
    </div>
  );
}
