import { Loader2 } from "lucide-react";
import { useAuthStore } from "../../stores";

export function SignInPrompt() {
  const { signIn, isLoading } = useAuthStore();

  const handleSignIn = async () => {
    try {
      await signIn();
    } catch (error) {
      // Error is logged in the store
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleSignIn}
        disabled={isLoading}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 disabled:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors"
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        )}
        <span>{isLoading ? "Signing in..." : "Sign in with Google"}</span>
      </button>

      <button
        onClick={handleSignIn}
        disabled={isLoading}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-black hover:bg-gray-900 disabled:bg-gray-700 text-white font-medium rounded-lg transition-colors"
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
          </svg>
        )}
        <span>{isLoading ? "Signing in..." : "Sign in with Apple"}</span>
      </button>

      <button
        onClick={handleSignIn}
        disabled={isLoading}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors"
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
        )}
        <span>{isLoading ? "Signing in..." : "Sign in with Email"}</span>
      </button>

      <div className="text-center mt-2">
        <button
          className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
          onClick={() => {
            // Continue without account - just dismiss the prompt
            // The app should work in offline/anonymous mode
          }}
        >
          Continue without account
        </button>
      </div>
    </div>
  );
}
