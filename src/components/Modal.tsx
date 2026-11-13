"use client";

import React from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  closeAriaLabel?: string;
  onClose?: () => void;
}

export function Modal({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  children,
  className = "",
  closeAriaLabel = "Close dialog",
  onClose,
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen && onClose) {
          onClose();
        }
      }}
    >
      <DialogBackdrop className="modal-backdrop" />
      <DialogContent className={`modal ${className}`.trim()}>
        <DialogClose
          type="button"
          className="modal-close icon-button"
          aria-label={closeAriaLabel}
          onClick={() => {
            if (onClose) onClose();
          }}
        >
          <X size={20} />
        </DialogClose>
        {eyebrow && <div className="modal-eyebrow">{eyebrow}</div>}
        {title && <DialogTitle>{title}</DialogTitle>}
        {description && <DialogDescription>{description}</DialogDescription>}
        {children}
      </DialogContent>
    </Dialog>
  );
}

export {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
};
export default Modal;
