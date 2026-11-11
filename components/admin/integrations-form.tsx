"use client";

import { useState, useTransition } from "react";
import { saveFirebaseConfig, savePaymentConfig, saveSmtpConfig } from "@/app/admin/integration-actions";
import { useFeedback } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PublicFirebaseConfig, PublicPaymentConfig, PublicSmtpConfig } from "@/lib/integrations/config";

function Status({ configured, enabled }: { configured: boolean; enabled: boolean }) {
  if (!configured) return <span className="text-xs text-muted-foreground">Not configured</span>;
  if (!enabled) return <span className="text-xs text-muted-foreground">Configured · off</span>;
  return <span className="text-xs text-primary">Configured · on</span>;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Panel({
  title,
  description,
  status,
  enabled,
  onEnabled,
  children,
  pending,
  onSave,
}: {
  title: string;
  description: string;
  status: React.ReactNode;
  enabled: boolean;
  onEnabled: (value: boolean) => void;
  children: React.ReactNode;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <section className="divide-y rounded-xl border bg-card" data-integration={title}>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium">{title}</h2>
            {status}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={`Enable ${title}`} />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div>
      <div className="flex justify-end p-4">
        <Button type="button" disabled={pending} onClick={onSave}>
          {pending ? "Saving…" : `Save ${title}`}
        </Button>
      </div>
    </section>
  );
}

export function IntegrationsForm({
  initial,
}: {
  initial: { smtp: PublicSmtpConfig; payment: PublicPaymentConfig; firebase: PublicFirebaseConfig };
}) {
  const { report } = useFeedback();
  const [smtpPending, startSmtp] = useTransition();
  const [paymentPending, startPayment] = useTransition();
  const [firebasePending, startFirebase] = useTransition();

  const [smtp, setSmtp] = useState(initial.smtp);
  const [smtpPassword, setSmtpPassword] = useState("");
  const [payment, setPayment] = useState(initial.payment);
  const [paymentSecret, setPaymentSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [firebase, setFirebase] = useState(initial.firebase);
  const [firebaseApiKey, setFirebaseApiKey] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="SMTP"
        description="Outbound mail for verification and password reset. Passwords are encrypted on the server and never sent back to the browser. Sending is used once email flows are wired."
        status={<Status configured={smtp.configured} enabled={smtp.enabled} />}
        enabled={smtp.enabled}
        onEnabled={(enabled) => setSmtp({ ...smtp, enabled })}
        pending={smtpPending}
        onSave={() => {
          startSmtp(async () => {
            const result = await saveSmtpConfig({
              enabled: smtp.enabled,
              host: smtp.host,
              port: smtp.port,
              secure: smtp.secure,
              username: smtp.username,
              password: smtpPassword || undefined,
              fromEmail: smtp.fromEmail,
              fromName: smtp.fromName,
            });
            if (result.ok) {
              setSmtp(result.config);
              setSmtpPassword("");
            }
            report(result, { title: "SMTP saved" });
          });
        }}
      >
        <Field id="smtp-host" label="Host">
          <Input
            id="smtp-host"
            value={smtp.host}
            onChange={(event) => setSmtp({ ...smtp, host: event.target.value })}
            placeholder="smtp.example.com"
            autoComplete="off"
          />
        </Field>
        <Field id="smtp-port" label="Port">
          <Input
            id="smtp-port"
            type="number"
            min={1}
            max={65535}
            value={smtp.port}
            onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) || 587 })}
          />
        </Field>
        <Field id="smtp-user" label="Username">
          <Input
            id="smtp-user"
            value={smtp.username}
            onChange={(event) => setSmtp({ ...smtp, username: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field id="smtp-password" label="Password" hint={smtp.passwordHint ? `Saved ${smtp.passwordHint}. Leave blank to keep it.` : "Required when enabling."}>
          <Input
            id="smtp-password"
            type="password"
            value={smtpPassword}
            onChange={(event) => setSmtpPassword(event.target.value)}
            autoComplete="new-password"
            placeholder={smtp.passwordHint ? "••••••••" : undefined}
          />
        </Field>
        <Field id="smtp-from-email" label="From email">
          <Input
            id="smtp-from-email"
            type="email"
            value={smtp.fromEmail}
            onChange={(event) => setSmtp({ ...smtp, fromEmail: event.target.value })}
            placeholder="noreply@example.com"
          />
        </Field>
        <Field id="smtp-from-name" label="From name">
          <Input
            id="smtp-from-name"
            value={smtp.fromName}
            onChange={(event) => setSmtp({ ...smtp, fromName: event.target.value })}
            placeholder="xAI"
          />
        </Field>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <div>
            <p className="text-sm font-medium">TLS on connect</p>
            <p className="text-sm text-muted-foreground">Use for port 465. Port 587 usually starts plain then upgrades.</p>
          </div>
          <Switch checked={smtp.secure} onCheckedChange={(secure) => setSmtp({ ...smtp, secure })} aria-label="TLS on connect" />
        </div>
      </Panel>

      <Panel
        title="Payment gateway"
        description="Keys for online plan checkout on /plans. Secrets stay encrypted. Admins can still change plans manually."
        status={<Status configured={payment.configured} enabled={payment.enabled} />}
        enabled={payment.enabled}
        onEnabled={(enabled) => setPayment({ ...payment, enabled })}
        pending={paymentPending}
        onSave={() => {
          startPayment(async () => {
            const result = await savePaymentConfig({
              enabled: payment.enabled,
              provider: payment.provider,
              keyId: payment.keyId,
              keySecret: paymentSecret || undefined,
              webhookSecret: webhookSecret || undefined,
              currency: payment.currency,
            });
            if (result.ok) {
              setPayment(result.config);
              setPaymentSecret("");
              setWebhookSecret("");
            }
            report(result, { title: "Payment gateway saved" });
          });
        }}
      >
        <Field id="pay-provider" label="Provider">
          <select
            id="pay-provider"
            value={payment.provider}
            onChange={(event) =>
              setPayment({ ...payment, provider: event.target.value as PublicPaymentConfig["provider"] })
            }
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring"
          >
            <option value="none">Not selected</option>
            <option value="razorpay">Razorpay</option>
            <option value="stripe">Stripe</option>
          </select>
        </Field>
        <Field id="pay-currency" label="Currency">
          <Input
            id="pay-currency"
            value={payment.currency}
            onChange={(event) => setPayment({ ...payment, currency: event.target.value.toUpperCase() })}
            maxLength={3}
            placeholder="INR"
          />
        </Field>
        <Field id="pay-key-id" label="Key id / publishable key">
          <Input
            id="pay-key-id"
            value={payment.keyId}
            onChange={(event) => setPayment({ ...payment, keyId: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field id="pay-secret" label="Secret key" hint={payment.keySecretHint ? `Saved ${payment.keySecretHint}. Leave blank to keep it.` : "Required when enabling."}>
          <Input
            id="pay-secret"
            type="password"
            value={paymentSecret}
            onChange={(event) => setPaymentSecret(event.target.value)}
            autoComplete="new-password"
            placeholder={payment.keySecretHint ? "••••••••" : undefined}
          />
        </Field>
        <Field id="pay-webhook" label="Webhook secret" hint={payment.webhookSecretHint ? `Saved ${payment.webhookSecretHint}. Leave blank to keep it.` : "Optional until webhooks are wired."}>
          <Input
            id="pay-webhook"
            type="password"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
            autoComplete="new-password"
            placeholder={payment.webhookSecretHint ? "••••••••" : undefined}
            className="sm:col-span-2"
          />
        </Field>
      </Panel>

      <Panel
        title="Firebase"
        description="Web app config for Google / phone / email auth when that sign-in path is enabled. The API key is stored encrypted; other fields are project identifiers."
        status={<Status configured={firebase.configured} enabled={firebase.enabled} />}
        enabled={firebase.enabled}
        onEnabled={(enabled) => setFirebase({ ...firebase, enabled })}
        pending={firebasePending}
        onSave={() => {
          startFirebase(async () => {
            const result = await saveFirebaseConfig({
              enabled: firebase.enabled,
              apiKey: firebaseApiKey || undefined,
              authDomain: firebase.authDomain,
              projectId: firebase.projectId,
              storageBucket: firebase.storageBucket,
              messagingSenderId: firebase.messagingSenderId,
              appId: firebase.appId,
              measurementId: firebase.measurementId,
            });
            if (result.ok) {
              setFirebase(result.config);
              setFirebaseApiKey("");
            }
            report(result, { title: "Firebase saved" });
          });
        }}
      >
        <Field id="fb-project" label="Project id">
          <Input
            id="fb-project"
            value={firebase.projectId}
            onChange={(event) => setFirebase({ ...firebase, projectId: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field id="fb-auth-domain" label="Auth domain">
          <Input
            id="fb-auth-domain"
            value={firebase.authDomain}
            onChange={(event) => setFirebase({ ...firebase, authDomain: event.target.value })}
            placeholder="your-app.firebaseapp.com"
            autoComplete="off"
          />
        </Field>
        <Field id="fb-api-key" label="API key" hint={firebase.apiKeyHint ? `Saved ${firebase.apiKeyHint}. Leave blank to keep it.` : "Required when enabling."}>
          <Input
            id="fb-api-key"
            type="password"
            value={firebaseApiKey}
            onChange={(event) => setFirebaseApiKey(event.target.value)}
            autoComplete="new-password"
            placeholder={firebase.apiKeyHint ? "••••••••" : undefined}
          />
        </Field>
        <Field id="fb-app-id" label="App id">
          <Input
            id="fb-app-id"
            value={firebase.appId}
            onChange={(event) => setFirebase({ ...firebase, appId: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field id="fb-bucket" label="Storage bucket">
          <Input
            id="fb-bucket"
            value={firebase.storageBucket}
            onChange={(event) => setFirebase({ ...firebase, storageBucket: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field id="fb-sender" label="Messaging sender id">
          <Input
            id="fb-sender"
            value={firebase.messagingSenderId}
            onChange={(event) => setFirebase({ ...firebase, messagingSenderId: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field id="fb-measurement" label="Measurement id" hint="Optional Analytics id.">
          <Input
            id="fb-measurement"
            value={firebase.measurementId}
            onChange={(event) => setFirebase({ ...firebase, measurementId: event.target.value })}
            autoComplete="off"
          />
        </Field>
      </Panel>
    </div>
  );
}
