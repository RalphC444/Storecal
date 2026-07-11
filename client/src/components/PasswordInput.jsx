import { useState } from "react";
import { Icon } from "./Icon";

// Password field with a show/hide toggle. Forwards all input props (value,
// onChange, placeholder, autoComplete, required…); just swaps type.
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <span className="pwfield">
      <input {...props} type={show ? "text" : "password"} />
      <button
        type="button"
        className="pwfield__toggle"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        <Icon name={show ? "eyeOff" : "eye"} />
      </button>
    </span>
  );
}
