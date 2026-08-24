'use client';

/** One optional line. Never required, never in the way. */
export function NoteField({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  id: string;
}) {
  return (
    <div className="mt-2">
      <label htmlFor={id} className="label">
        Notitie, optioneel
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={280}
        placeholder="Eén regel, als je wilt"
        className="recess mt-1 h-11 w-full px-3 text-[13px] outline-none"
        style={{ color: 'var(--ink)' }}
      />
    </div>
  );
}
