import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface DepositRejectedEmailProps {
  expenseName: string;
  amount: number;
  rejectionReason: string;
  expenseUrl: string;
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export default function DepositRejectedEmail({
  expenseName,
  amount,
  rejectionReason,
  expenseUrl,
}: DepositRejectedEmailProps) {
  const previewText = `입금요청 "${expenseName}"이(가) 반려되었습니다.`;

  return (
    <Html lang="ko">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={headerLabel}>ExpenseFlow</Text>
          </Section>

          <Section style={content}>
            <Heading style={heading}>입금요청 반려 안내</Heading>
            <Text style={paragraph}>
              요청하신 입금요청이 반려되었습니다. 아래 사유를 확인 후 수정하여
              다시 제출해 주세요.
            </Text>

            <Section style={detailBox}>
              <Text style={detailRow}>
                <span style={detailLabel}>제목</span>
                <span style={detailValue}>{expenseName}</span>
              </Text>
              <Hr style={detailDivider} />
              <Text style={detailRow}>
                <span style={detailLabel}>금액</span>
                <span style={detailValue}>{formatAmount(amount)}</span>
              </Text>
            </Section>

            <Section style={reasonBox}>
              <Text style={reasonLabel}>반려 사유</Text>
              <Text style={reasonText}>{rejectionReason}</Text>
            </Section>

            <Section style={buttonContainer}>
              <Link href={expenseUrl} style={button}>
                상세 내역 확인하기
              </Link>
            </Section>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              이 메일은 ExpenseFlow에서 자동 발송되었습니다.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "20px 0 48px",
};

const header: React.CSSProperties = {
  padding: "24px 32px",
};

const headerLabel: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#1a1a2e",
  margin: 0,
};

const content: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "32px",
  border: "1px solid #e5e7eb",
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#1a1a2e",
  margin: "0 0 12px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#4b5563",
  margin: "0 0 24px",
};

const detailBox: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "16px 20px",
  marginBottom: "16px",
};

const detailRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "20px",
  color: "#111827",
  margin: "8px 0",
  display: "flex",
  justifyContent: "space-between",
};

const detailLabel: React.CSSProperties = {
  color: "#6b7280",
  fontWeight: 500,
};

const detailValue: React.CSSProperties = {
  fontWeight: 600,
  color: "#111827",
};

const detailDivider: React.CSSProperties = {
  borderTop: "1px solid #e5e7eb",
  margin: "8px 0",
};

const reasonBox: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderRadius: "6px",
  borderLeft: "4px solid #ef4444",
  padding: "16px 20px",
  marginBottom: "24px",
};

const reasonLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#dc2626",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  margin: "0 0 8px",
};

const reasonText: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#991b1b",
  margin: 0,
};

const buttonContainer: React.CSSProperties = {
  textAlign: "center" as const,
};

const button: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#1a1a2e",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  padding: "12px 24px",
  borderRadius: "6px",
};

const footer: React.CSSProperties = {
  padding: "24px 32px 0",
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#9ca3af",
  textAlign: "center" as const,
  margin: 0,
};
