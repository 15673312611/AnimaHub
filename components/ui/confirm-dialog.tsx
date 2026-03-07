"use client";

import { useState, useCallback, createContext, useContext, ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";
import { Button } from "./button";
import { AlertTriangle, Trash2, Info } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
}

interface ConfirmContextType {
  confirm: (options?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const [resolveRef, setResolveRef] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setResolveRef(() => resolve);
      setOpen(true);
    });
  }, []);

  const handleConfirm = () => {
    setOpen(false);
    resolveRef?.(true);
  };

  const handleCancel = () => {
    setOpen(false);
    resolveRef?.(false);
  };

  const {
    title = "确认操作",
    description = "确定要执行此操作吗？",
    confirmText = "确认",
    cancelText = "取消",
    variant = "danger"
  } = options;

  const Icon = variant === "danger" ? Trash2 : variant === "warning" ? AlertTriangle : Info;
  const iconBg = variant === "danger" ? "bg-red-500/10" : variant === "warning" ? "bg-amber-500/10" : "bg-blue-500/10";
  const iconColor = variant === "danger" ? "text-red-500" : variant === "warning" ? "text-amber-500" : "text-blue-500";
  const btnClass = variant === "danger" 
    ? "bg-red-600 hover:bg-red-700 text-white" 
    : variant === "warning" 
    ? "bg-amber-600 hover:bg-amber-700 text-white" 
    : "bg-blue-600 hover:bg-blue-700 text-white";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-white/10 text-white max-w-sm rounded-2xl">
          <DialogHeader className="flex flex-col items-center text-center pt-2">
            <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mb-4`}>
              <Icon className={`w-7 h-7 ${iconColor}`} />
            </div>
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <DialogDescription className="text-zinc-400 mt-2">
              {description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 mt-4 sm:justify-center">
            <Button 
              variant="ghost" 
              onClick={handleCancel}
              className="flex-1 h-11 rounded-xl hover:bg-white/5 border border-white/10"
            >
              {cancelText}
            </Button>
            <Button 
              onClick={handleConfirm}
              className={`flex-1 h-11 rounded-xl ${btnClass}`}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context.confirm;
}
