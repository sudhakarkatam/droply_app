import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface PasswordDialogProps {
  open: boolean;
  onPasswordSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordDialog({ open, onPasswordSubmit, onCancel }: PasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Please enter a password");
      return;
    }
    setError("");
    onPasswordSubmit(password);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="glass-card p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Password Protected Room
          </DialogTitle>
          <DialogDescription className="text-sm">
            This room is password protected. Please enter the password to access it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Enter room password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="bg-background/50 text-sm sm:text-base"
              autoFocus
            />
            {error && <p className="text-xs sm:text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end flex-col sm:flex-row">
            <Button type="button" variant="outline" onClick={onCancel} className="w-full sm:w-auto text-sm sm:text-base">
              Cancel
            </Button>
            <Button type="submit" className="gradient-warm w-full sm:w-auto text-sm sm:text-base">
              Unlock Room
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}