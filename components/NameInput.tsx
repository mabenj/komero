"use client";

/** A name edited in place: saved when it loses focus, put back when left empty. */
export function NameInput({
  name,
  label,
  maxLength,
  onRename,
}: {
  name: string;
  label: string;
  maxLength?: number;
  onRename: (name: string) => void;
}) {
  return (
    <input
      // Re-mounts when the name changes on another phone, showing the new name.
      key={name}
      defaultValue={name}
      aria-label={label}
      maxLength={maxLength}
      enterKeyHint="done"
      autoComplete="off"
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      onBlur={(event) => {
        const typed = event.currentTarget.value.trim();
        if (typed === "") event.currentTarget.value = name;
        else if (typed !== name) onRename(typed);
      }}
      className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-base"
    />
  );
}
