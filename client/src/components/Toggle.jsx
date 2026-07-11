// A switch-style on/off toggle. onChange receives the new boolean.
export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={"toggle" + (disabled ? " toggle--disabled" : "")}>
      <input
        type="checkbox"
        className="toggle__input"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
      {label && <span className="toggle__label">{label}</span>}
    </label>
  );
}
