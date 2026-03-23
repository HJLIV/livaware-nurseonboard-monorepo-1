import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center animate-fade-in-up max-w-md">
        <p className="font-serif text-8xl font-light text-primary/30 mb-4">404</p>
        <h1 className="font-serif text-2xl font-light tracking-tight text-foreground mb-2">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2 font-semibold">
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
          <Link href="/">
            <Button className="gap-2 font-semibold">
              <Home className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
