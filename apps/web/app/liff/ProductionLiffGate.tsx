"use client";

import liff from "@line/liff";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { ErrorState, LoadingState, PermissionDeniedState } from "../ui/states";

import { LiffHome, type LiffCitizenIdentity } from "./LiffHome";
import { ComplaintDetail, ComplaintList, AdditionalInfo } from "./complaints/ComplaintTracking";
import { ComplaintWizard } from "./complaints/new/ComplaintWizard";

export type ProductionLiffBootstrap = {
  tenantId: string;
  tenantDisplayName: string;
  liffAppId: string;
  lineUserId: string;
  requiredConsentVersion: string | null;
  intakeQueueId: string | null;
  intakeQueueName: string | null;
  categories: readonly { id: string; code: string; label: string }[];
};

type ProductionLiffSession = {
  tenantId: string;
  tenantName: string;
  liffAppId: string;
  lineUserId: string;
  csrfToken: string;
};

export type ProductionLiffContextValue = {
  identity: LiffCitizenIdentity;
  bootstrap: ProductionLiffBootstrap;
  csrfToken: string;
};

const SessionContext = createContext<ProductionLiffContextValue | undefined>(undefined);

const errorMessage = (payload: unknown): string => {
  if (payload && typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return "ไม่สามารถเริ่มเซสชัน LINE ได้ กรุณาลองใหม่อีกครั้ง";
};

async function readJson<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(errorMessage(payload));
  return payload as T;
}

export function useProductionLiffSession(): ProductionLiffContextValue | undefined {
  return useContext(SessionContext);
}

function BoundaryContent({ children, liffAppId }: { children: ReactNode; liffAppId: string }) {
  const [value, setValue] = useState<ProductionLiffContextValue>();
  const [failure, setFailure] = useState<{ kind: "permission" | "error"; message?: string }>();

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        if (!liffAppId) throw new Error("LIFF app ยังไม่ได้ตั้งค่า");
        await liff.init({ liffId: liffAppId, withLoginOnExternalBrowser: true });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const idToken = liff.getIDToken();
        const accessToken = liff.getAccessToken();
        const token = idToken ?? accessToken;
        const tokenKind = idToken ? "id_token" : "access_token";
        if (!token) throw new Error("ไม่พบ token จาก LINE");
        const sessionResponse = await fetch("/api/v1/liff/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ liffAppId, token, tokenKind }),
          cache: "no-store",
        });
        const sessionPayload = await readJson<{ data: ProductionLiffSession }>(sessionResponse);
        const bootstrapResponse = await fetch("/api/v1/citizen/bootstrap", { cache: "no-store" });
        const bootstrapPayload = await readJson<{ data: ProductionLiffBootstrap }>(bootstrapResponse);
        if (!cancelled) {
          const nextValue: ProductionLiffContextValue = {
            identity: {
              tenantId: sessionPayload.data.tenantId,
              lineUserId: sessionPayload.data.lineUserId,
              tenantName: sessionPayload.data.tenantName,
              synthetic: false,
            },
            bootstrap: bootstrapPayload.data,
            csrfToken: sessionPayload.data.csrfToken,
            } satisfies ProductionLiffContextValue;
          setValue(nextValue);
          window.sessionStorage.setItem("citychatbot:csrf-token", nextValue.csrfToken);
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "ไม่สามารถเริ่มเซสชัน LINE ได้";
        setFailure({ kind: /ยังไม่เปิด|ไม่มีสิทธิ์|ไม่ได้เปิด|ยังไม่ได้ตั้งค่า/u.test(message) ? "permission" : "error", message });
      }
    };
    void start();
    return () => { cancelled = true; };
  }, [liffAppId]);

  if (failure?.kind === "permission") return <main className="liff-unavailable"><PermissionDeniedState /></main>;
  if (failure) return <main className="liff-unavailable"><ErrorState message={failure.message} action={<button className="liff-button liff-button--secondary" onClick={() => window.location.reload()} type="button">ลองใหม่</button>} /></main>;
  if (!value) return <main className="liff-unavailable"><LoadingState title="กำลังยืนยันตัวตน LINE" message="กำลังตรวจสอบสิทธิ์และโหลดข้อมูลของเทศบาล" /></main>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function ProductionLiffBoundary({ children, liffAppId }: { children: ReactNode; liffAppId: string }) {
  return <BoundaryContent liffAppId={liffAppId}>{children}</BoundaryContent>;
}

export function ProductionLiffGate({ liffAppId }: { liffAppId: string }) {
  return <ProductionLiffBoundary liffAppId={liffAppId}><HomeFromSession /></ProductionLiffBoundary>;
}

function HomeFromSession() {
  const session = useProductionLiffSession();
  const identity = useMemo(() => session?.identity, [session?.identity]);
  return identity && session ? <LiffHome bootstrap={session.bootstrap} identity={identity} /> : null;
}

export function ProductionComplaintList() {
  const session = useProductionLiffSession();
  return session ? <ComplaintList identity={session.identity} /> : null;
}

export function ProductionComplaintDetail({ complaintId }: { complaintId: string }) {
  const session = useProductionLiffSession();
  return session ? <ComplaintDetail complaintId={complaintId} identity={session.identity} /> : null;
}

export function ProductionAdditionalInfo({ complaintId }: { complaintId: string }) {
  const session = useProductionLiffSession();
  return session ? <AdditionalInfo complaintId={complaintId} identity={session.identity} /> : null;
}

export function ProductionComplaintWizard() {
  const session = useProductionLiffSession();
  if (!session) return null;
  return <ComplaintWizard config={{
    tenantId: session.identity.tenantId,
    lineUserId: session.identity.lineUserId,
    intakeQueueId: session.bootstrap.intakeQueueId ?? "",
    tenantName: session.identity.tenantName,
    consentVersion: session.bootstrap.requiredConsentVersion ?? "canary-test-v1",
    categories: session.bootstrap.categories,
    synthetic: false,
  }} />;
}
