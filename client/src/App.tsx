import { useState, useEffect } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import { getAuthToken, clearAuthToken } from "@/lib/auth-token";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthed(false);
      return;
    }
    // Verify token with backend
    apiRequest("GET", "/api/verify", undefined, {
      Authorization: `Bearer ${token}`,
    })
      .then((res) => {
        if (res.ok) setAuthed(true);
        else {
          clearAuthToken();
          setAuthed(false);
        }
      })
      .catch(() => {
        clearAuthToken();
        setAuthed(false);
      });
  }, []);

  if (authed === null) {
    // Loading state
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-emerald-50">
        <div className="animate-pulse text-green-600 text-lg font-medium">
          Memuat...
        </div>
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthGate>
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </AuthGate>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
