import { AlertCircle, CheckCircle2 } from "lucide-react"

interface FormFeedbackProps {
  message: string
  tone: "error" | "success"
}

export function FormFeedback({ message, tone }: FormFeedbackProps) {
  const isError = tone === "error"
  const Icon = isError ? AlertCircle : CheckCircle2

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
        isError
          ? "border-destructive/25 bg-destructive/10 text-destructive"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
      role={isError ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="leading-6">{message}</p>
    </div>
  )
}
