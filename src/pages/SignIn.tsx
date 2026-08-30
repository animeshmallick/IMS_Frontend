import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { signIn } from "../lib/auth";
import { Field } from "../components/ui";

/**
 * The front door.
 *
 * The first screen anybody sees, and for most staff the only one they see
 * before trusting the system with a day's takings — so it is the one screen
 * where looking unfinished costs something real. It was a bare <form> with no
 * card and no fields, wearing none of the styling the stylesheet had written
 * for it.
 *
 * Still restrained. This is a tool people sign into forty times a week, not a
 * product being sold to them: one card, one field per line, and nothing that
 * has to be read twice.
 */
export function SignIn() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      // Deliberately vague: distinguishing "no such account" from "wrong
      // password" tells an attacker which staff emails are real.
      setError("Those details were not recognised.");
      setPending(false);
      return;
    }

    // Session cookie is set; refetch /me so permissions load before routing.
    await queryClient.invalidateQueries({ queryKey: ["session"] });
    setPending(false);
  }

  return (
    <main className="signin">
      <div className="signin-card card">
        <div className="card-body">
          <div className="signin-brand">
            <span className="mark" aria-hidden>
              IM
            </span>
            <h1>Sign in to IMS</h1>
            <p className="hint">Inventory, counter and stock control</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/*
             * Announced rather than merely coloured. Someone who has just typed
             * a password wrong is looking at the field, not at the top of the
             * card, and a screen reader is looking at neither.
             */}
            {error ? (
              <div className="alert error" role="alert">
                {error}
              </div>
            ) : null}

            <Field label="Email">
              <input
                id="email"
                type="email"
                value={email}
                autoComplete="username"
                autoFocus
                required
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Password">
              <div className="password-field">
                <input
                  id="password"
                  type={reveal ? "text" : "password"}
                  value={password}
                  autoComplete="current-password"
                  required
                  onChange={(e) => setPassword(e.target.value)}
                  /*
                   * Caps lock, on the one screen where it matters. The field is
                   * masked and the failure message is deliberately vague, so
                   * without this the only feedback for a stuck caps-lock key is
                   * "those details were not recognised" — three times.
                   */
                  onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                  onBlur={() => setCapsLock(false)}
                />
                <button
                  type="button"
                  // Not in the tab order: it sits between the password field
                  // and the submit button, and nobody tabbing through a login
                  // form wants a stop there.
                  tabIndex={-1}
                  onClick={() => setReveal((on) => !on)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  title={reveal ? "Hide password" : "Show password"}
                >
                  {reveal ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                </button>
              </div>
              {capsLock ? (
                <span className="caps-warn" role="status">
                  <TriangleAlert size={13} aria-hidden />
                  Caps lock is on
                </span>
              ) : null}
            </Field>

            <button
              type="submit"
              className={pending ? "primary block busy" : "primary block"}
              disabled={pending}
            >
              {pending ? "Signing in" : "Sign in"}
            </button>
          </form>
        </div>
      </div>

      <p className="signin-foot">Trouble signing in? Ask your administrator to reset your access.</p>
    </main>
  );
}
