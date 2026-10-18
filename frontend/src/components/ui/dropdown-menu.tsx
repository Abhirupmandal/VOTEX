"use client";

import * as React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (value: boolean) => void;
}

const DropdownContext = createContext<DropdownContextValue | null>(null);

function useDropdown(): DropdownContextValue {
  const ctx = useContext(DropdownContext);
  if (!ctx) {
    throw new Error("DropdownMenu components must be used inside <DropdownMenu>.");
  }
  return ctx;
}

export interface DropdownMenuProps {
  children: ReactNode;
}

/** Lightweight, dependency-free dropdown menu (click-outside + Escape aware). */
export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={rootRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

export interface DropdownMenuTriggerProps {
  children: ReactNode;
  asChild?: boolean;
}

export function DropdownMenuTrigger({ children, asChild }: DropdownMenuTriggerProps) {
  const { open, setOpen } = useDropdown();
  const toggle = () => setOpen(!open);

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
      "aria-expanded"?: boolean;
      "aria-haspopup"?: string;
    }>;
    const existing = child.props.onClick;
    return React.cloneElement(child, {
      "aria-haspopup": "menu",
      "aria-expanded": open,
      onClick: (event: React.MouseEvent) => {
        existing?.(event);
        toggle();
      },
    });
  }

  return (
    <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
      {children}
    </button>
  );
}

export interface DropdownMenuContentProps {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function DropdownMenuContent({
  children,
  align = "end",
  className,
}: DropdownMenuContentProps) {
  const { open } = useDropdown();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          className={cn(
            "absolute z-50 mt-2 min-w-[12rem] overflow-hidden rounded-md border border-border/60 bg-card p-1 shadow-xl shadow-black/40",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function DropdownMenuItem({
  children,
  className,
  onClick,
  ...props
}: DropdownMenuItemProps) {
  const { setOpen } = useDropdown();
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-border/60", className)} />;
}
