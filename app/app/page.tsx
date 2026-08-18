import type { Metadata } from "next";
import Workspace from "./Workspace";

export const metadata: Metadata = {
  title: "TAID Workspace — 현장 지식 운영",
  description: "음성 회고를 구조화하고 검토·승인된 현장 지식으로 전환하는 TAID MVP",
};

export default function AppPage() {
  return <Workspace />;
}
