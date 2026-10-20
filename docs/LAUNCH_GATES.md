# Zipli Pro — Launch Gates (Physical Human Actions)

> Per `08_DEVOPS_QA_LAUNCH.md` and Part 4, these gates can ONLY be satisfied by human authorities and operational stewards. They are never simulated or marked done automatically.

---

## 1. Business & Legal Gates
- [ ] **Company Registration**: Legal entity registered in India (Pvt Ltd / LLP).
- [ ] **GST Registration**: GSTIN obtained and validated; CA reviewed e-commerce operator classification.
- [ ] **Bank Account & KYC**: Dedicated corporate banking account setup with payment gateway live KYC.
- [ ] **FSSAI & Regulatory Licenses**: FSSAI Central/State license obtained for food delivery & storage.
- [ ] **Terms & Privacy Policies**: DPDP-compliant Terms of Service, Privacy Policy, and Refund Policy reviewed by retained legal counsel.
- [ ] **Telecom & DLT Registration**: DLT registration for transactional SMS templates (OTP, delivery alerts) and approved WhatsApp Business API templates.
- [ ] **Partner Agreements**: Store onboarding contracts and delivery partner terms/insurance executed.

---

## 2. Platform Infrastructure & Production Access
- [ ] **Production Cloud Accounts**: Isolated AWS production account provisioned with IAM least-privilege roles and MFA.
- [ ] **Secrets & Key Rotation**: Live Razorpay API keys, JWT master secret, and database passwords securely injected into AWS Secrets Manager (never committed).
- [ ] **Domain & Certificates**: Domain registered, Route53 configured, AWS ACM SSL/TLS certificates issued.
- [ ] **Infrastructure Provisioning**: Manual review and execution of `terraform apply` by DevOps administrator.

---

## 3. Physical Operations & Pilot Rollout
- [ ] **Dark Store Verification**: Physical store readiness, barcode scanners, and inventory intake tested.
- [ ] **Rider Fleet Onboarding**: Initial rider cohort onboarded and trained with rider mobile interface.
- [ ] **Support Staffing**: Customer support rota staffed and trained on escalation workflows and refund policies.
- [ ] **Pilot Launch Approval**: Go/No-Go decision by platform leadership for soft launch (single zone / 50 orders/day).
