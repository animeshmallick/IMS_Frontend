import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { signIn } from "../lib/auth";

export function SignIn() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <form onSubmit={handleSubmit}>
        <h1>IMS</h1>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          autoComplete="username"
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <p role="alert">{error}</p> : null}

        <button type="submit" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
