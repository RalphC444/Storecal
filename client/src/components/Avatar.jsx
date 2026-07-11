// A person's avatar — their photo as a background, or their initial as a fallback.
export function Avatar({ name, photo, className }) {
  const cls = "pav" + (className ? " " + className : "");
  if (photo)
    return (
      <span
        className={cls}
        style={{ backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" }}
        aria-label={name}
      />
    );
  return <span className={cls}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
}
