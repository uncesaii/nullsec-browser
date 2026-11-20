import type { ComponentChildren, ComponentProps } from "preact";
import { X } from "lucide-preact";

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg
      class="ns-brand-mark"
      width={size}
      height={size}
      viewBox="0 0 128 128"
      aria-hidden="true"
    >
      <rect width="128" height="128" rx="24" fill="currentColor" />
      <path d="M34 94V34h12l36 38V34h12v60H82L46 56v38z" fill="var(--ns-bg)" />
    </svg>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: "secondary" | "primary" | "danger";
  size?: "md" | "sm";
}) {
  return (
    <button
      type="button"
      {...props}
      class={`ns-button ${props.class ?? ""}`}
      data-variant={variant === "secondary" ? undefined : variant}
      data-size={size === "md" ? undefined : size}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  ...props
}: ComponentProps<"button"> & {
  label: string;
}) {
  return (
    <button
      type="button"
      {...props}
      class={`ns-icon-button ${props.class ?? ""}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
  htmlFor?: string;
}) {
  return (
    <div class="ns-field">
      <label class="ns-label" for={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <span class="ns-hint">{hint}</span> : null}
    </div>
  );
}

export function Badge({
  children,
  tone,
  title,
}: {
  children: ComponentChildren;
  tone?: "solid" | "danger";
  title?: string;
}) {
  return (
    <span class="ns-badge" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function Banner({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children?: ComponentChildren;
  tone?: "default" | "danger";
}) {
  return (
    <div class="ns-banner" data-tone={tone === "danger" ? "danger" : undefined}>
      <div>
        <p class="ns-banner-title">{title}</p>
        {children ? <div class="ns-banner-text">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ComponentChildren;
  title: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="ns-empty">
      {icon}
      <div class="ns-empty-title">{title}</div>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="ns-section">
      {title || action ? (
        <div class="ns-section-header">
          {title ? <h2 class="ns-section-title">{title}</h2> : <span class="ns-grow" />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface TabItem {
  id: string;
  label: string;
  icon?: ComponentChildren;
}

export function Tabs({
  items,
  active,
  onChange,
  label,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div class="ns-tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          type="button"
          class="ns-tab"
          role="tab"
          aria-selected={active === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({
  message,
  tone = "default",
  onClose,
}: {
  message: string;
  tone?: "default" | "danger";
  onClose: () => void;
}) {
  return (
    <div class="ns-toast" data-tone={tone === "danger" ? "danger" : undefined} role="status">
      <div class="ns-row">
        <span class="ns-grow">{message}</span>
        <IconButton label="Dismiss" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ComponentChildren;
}) {
  return (
    <div class="ns-page-header">
      <div class="ns-page-header-text">
        <h1 class="ns-page-title">{title}</h1>
        {subtitle ? <p class="ns-page-subtitle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}