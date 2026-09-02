import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import type { UseFormRegisterReturn } from "react-hook-form"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PasswordFieldProps {
  autoComplete: "current-password" | "new-password"
  error?: string
  hint?: string
  id: string
  label: string
  registration: UseFormRegisterReturn
}

export function PasswordField({
  autoComplete,
  error,
  hint,
  id,
  label,
  registration,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)
  const descriptionId = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          {...registration}
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className="pr-11"
          id={id}
          type={isVisible ? "text" : "password"}
        />
        <button
          aria-label={isVisible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={isVisible}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          {isVisible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
