import type { ProjectType } from "@/lib/projects";

/**
 * Public website pages. List fields use one entry per line as
 * "Title | Description".
 */
export type NavGroup = "domains" | "hosting" | "email" | "solutions" | "ai" | "company";

export const NAV_GROUPS: { id: NavGroup; label: string; menu: boolean }[] = [
  { id: "domains", label: "Domains", menu: true },
  { id: "hosting", label: "Hosting", menu: true },
  { id: "email", label: "Email & Security", menu: true },
  { id: "solutions", label: "Solutions", menu: true },
  { id: "ai", label: "AI", menu: false },
  { id: "company", label: "Company", menu: false },
];

export type SitePage = {
  slug: string;
  path: string;
  layout: "product" | "domains" | "solution" | "faq" | "support" | "about" | "ai";
  nav: NavGroup;
  productGroup?: string;
  projectType?: ProjectType;
  domainAction?: "register" | "transfer";
  title: string;
  meta: string;
  eyebrow: string;
  summary: string;
  heroTitle: string;
  heroLead: string;
  body?: string;
  features?: string;
  steps?: string;
  faqs?: string;
  productsTitle?: string;
  productsLead?: string;
  ctaTitle?: string;
  ctaLead?: string;
};

export const HOME = {
  title: "CONZEX · Hosting, infrastructure and AI",
  meta: "CONZEX provides cloud hosting, VPS, dedicated servers, web hosting, domains, custom infrastructure and the CONZEX AI assistant.",
  eyebrow: "Hosting, infrastructure and AI",
  heroTitle: "Hosting and infrastructure for growing businesses",
  heroLead:
    "Deploy cloud, VPS, dedicated and web hosting, register domains, plan custom infrastructure, and work with CONZEX AI, all from one account.",
  highlights: [
    "Hosting, domains and SSL in one account",
    "Order and pay online with Razorpay",
    "Project requests tracked in your portal",
    "CONZEX AI included with your account",
  ],
  productsTitle: "Everything your business needs online",
  productsLead: "Standard plans you can order online, from a first website to dedicated hardware.",
  solutionsTitle: "Custom solutions, scoped around you",
  solutionsLead:
    "When a standard plan is not the right fit, our team scopes, quotes and delivers an environment around your requirements. Every request is tracked in your portal, from the first message to onboarding.",
  steps:
    "Submit a request | Describe your workloads, environments and timelines.\nReceive a proposal | Review an itemised proposal in your portal.\nAccept online | Accept the proposal and pay the invoice from your portal.\nOnboard and track | Follow delivery and onboarding from your project page.",
  faqs:
    "What does CONZEX offer? | CONZEX provides cloud hosting, VPS, dedicated servers, web hosting, domain registration and transfer, SSL certificates, custom infrastructure projects and the CONZEX AI assistant.\nCan I manage everything from one account? | Yes. Services, invoices, project requests and CONZEX AI all use the same CONZEX account.\nWhat if a standard plan does not fit? | Submit a project request. Our team reviews your requirements and sends a formal proposal you can accept online.\nCan I move my existing domain or website? | Yes. Request a domain transfer or a migration and our team will plan it with you.\nHow do I get support? | Sign in and send a message on a project request from your portal.",
  ctaTitle: "Talk to the CONZEX team",
  ctaLead: "Tell us what you are planning and we will help you choose the right services.",
};

export const PAGES: SitePage[] = [
  {
    slug: "domain-registration",
    path: "/domains",
    layout: "domains",
    nav: "domains",
    domainAction: "register",
    projectType: "domain",
    title: "Domain Registration",
    meta: "Search and register domain names with CONZEX.",
    eyebrow: "Domains",
    summary: "Search for and register your domain name.",
    heroTitle: "Find and register your domain",
    heroLead: "Search available domain names and register them alongside your hosting in one account.",
    features:
      "Live availability | Every search checks the registry's own RDAP service.\nDNS and nameservers | Our team configures records and nameservers for domains we manage.\nOne account | Domains sit alongside your hosting, invoices and requests.",
    faqs: "Can I register a domain without hosting? | Yes. Domains can be registered on their own and connected to hosting later.\nHow is registration completed? | Send a registration request for an available name. Our team registers it and issues an invoice in your portal.",
    ctaTitle: "Moving domains from another provider?",
    ctaLead: "Transfer existing domains to CONZEX and manage everything in one place.",
  },
  {
    slug: "domain-transfer",
    path: "/domains/transfer",
    layout: "domains",
    nav: "domains",
    domainAction: "transfer",
    projectType: "domain",
    title: "Domain Transfer",
    meta: "Transfer your domain names to CONZEX.",
    eyebrow: "Domains",
    summary: "Move existing domains to your CONZEX account.",
    heroTitle: "Transfer your domains to CONZEX",
    heroLead: "Bring your existing domains into the same account as your hosting, billing and support.",
    steps:
      "Unlock your domain | Remove the transfer lock at your current registrar.\nGet the authorisation code | Request the EPP or authorisation code from your current registrar.\nStart the transfer | Send a transfer request below. Never paste the code into a public form; our team asks for it securely.\nApprove and complete | Confirm the transfer when prompted. Your domain appears in your portal once complete.",
    faqs: "Will my website go offline during the transfer? | Transfers do not change your nameservers, so your website continues to resolve as normal.\nIs a renewal included? | Most domain extensions are extended by one year when transferred. Your invoice shows the exact terms.",
    ctaTitle: "Need help with a bulk transfer?",
    ctaLead: "Send a request and our team will plan the transfer of a domain portfolio.",
  },
  {
    slug: "web-hosting",
    path: "/hosting/web",
    layout: "product",
    nav: "hosting",
    productGroup: "web-hosting",
    projectType: "custom_hosting",
    title: "Web Hosting",
    meta: "Reliable web hosting from CONZEX for websites, email and online stores.",
    eyebrow: "Hosting",
    summary: "Managed hosting for websites, email and online stores.",
    heroTitle: "Web hosting for websites that matter",
    heroLead: "Host websites, email and online stores on managed infrastructure, with domains, SSL and billing in one account.",
    features:
      "Managed platform | We maintain the hosting platform so you can focus on your website.\nEmail included where offered | Create mailboxes on your own domain with supported plans.\nOne account | Manage hosting, domains, SSL and invoices from your CONZEX portal.\nSupport when you need it | Raise and track requests directly from your account.",
    productsTitle: "Web hosting plans",
    productsLead: "Choose a plan and tell us the domain it is for.",
    faqs: "Can I use my existing domain? | Yes. You can use a domain you already own or transfer it to CONZEX.",
    ctaTitle: "Hosting several websites?",
    ctaLead: "Send a request for agency and multi-site hosting requirements.",
  },
  {
    slug: "wordpress-hosting",
    path: "/hosting/wordpress",
    layout: "product",
    nav: "hosting",
    productGroup: "wordpress-hosting",
    projectType: "custom_hosting",
    title: "WordPress Hosting",
    meta: "WordPress hosting from CONZEX for blogs, business websites and online stores.",
    eyebrow: "Hosting",
    summary: "Hosting prepared for WordPress websites and stores.",
    heroTitle: "Hosting made for WordPress",
    heroLead: "Launch and run WordPress websites on hosting configured for it, with domains, SSL and billing in the same CONZEX account.",
    features:
      "Ready for WordPress | Plans are configured for the requirements of WordPress and its plugins.\nDomains and SSL together | Add a domain and SSL certificate alongside your hosting.\nOne account | Manage hosting, domains, invoices and requests from your CONZEX portal.\nMigration help | Our team can move an existing WordPress website through a project request.",
    productsTitle: "WordPress hosting plans",
    productsLead: "Choose a plan and tell us the domain it is for.",
    faqs: "Can you move my existing WordPress website? | Yes. Submit a project request with the details of your current host and our team will plan the migration.\nCan I use my own domain? | Yes. Use a domain you already own, transfer it, or register a new one.",
    ctaTitle: "Running several WordPress websites?",
    ctaLead: "Send a request for agency and multi-site requirements.",
  },
  {
    slug: "website-builder",
    path: "/websites/builder",
    layout: "product",
    nav: "hosting",
    productGroup: "website-builder",
    projectType: "other",
    title: "Website Builder",
    meta: "Build a website without code using the CONZEX website builder.",
    eyebrow: "Websites",
    summary: "Create a website without writing code.",
    heroTitle: "Build your website without code",
    heroLead: "Create a professional website with a visual editor, then publish it on your own domain from the same CONZEX account.",
    features:
      "Visual editing | Arrange pages, text and images without writing code.\nYour own domain | Publish on a domain you register or already own.\nMobile-friendly pages | Websites adapt to phones, tablets and desktops.\nManaged with your services | Billing and support sit alongside your other CONZEX services.",
    productsTitle: "Website builder plans",
    productsLead: "Choose a plan to start building.",
    faqs: "Do I need hosting as well? | No. Website builder plans include what you need to publish your website.\nCan you build the website for me? | Yes. Submit a project request describing the website you need and we will send a quotation.",
    ctaTitle: "Prefer us to build it?",
    ctaLead: "Tell us about your business and we will prepare a quotation.",
  },
  {
    slug: "cloud-hosting",
    path: "/hosting/cloud",
    layout: "product",
    nav: "hosting",
    productGroup: "cloud-hosting",
    projectType: "cloud_infrastructure",
    title: "Cloud Hosting",
    meta: "Scalable cloud hosting from CONZEX for websites, applications and business workloads.",
    eyebrow: "Compute",
    summary: "Scalable cloud resources for applications and websites.",
    heroTitle: "Cloud hosting that scales with your workloads",
    heroLead: "Run applications and websites on cloud resources you can resize as demand changes, managed from a single CONZEX account.",
    features:
      "Scale on demand | Upgrade resources as your traffic and data grow, without rebuilding your environment.\nIsolated resources | Each plan runs with dedicated allocations so neighbouring workloads do not affect yours.\nSingle portal | Manage services, billing and requests from one customer portal.\nGuided onboarding | Our team can help plan migrations and configuration for new deployments.",
    productsTitle: "Cloud hosting plans",
    productsLead: "Choose a plan to order. Prices are shown in your selected currency.",
    faqs: "Can I upgrade my plan later? | Yes. Send a request from your portal and our team will move you to a larger plan.\nCan CONZEX help with a migration? | Yes. Submit a project request describing your current environment and our team will review it.",
    ctaTitle: "Need a tailored cloud environment?",
    ctaLead: "Describe your architecture and requirements, and we will prepare a proposal.",
  },
  {
    slug: "vps-hosting",
    path: "/servers/vps",
    layout: "product",
    nav: "hosting",
    productGroup: "vps-hosting",
    projectType: "vps_config",
    title: "VPS Hosting",
    meta: "Virtual private servers from CONZEX with dedicated resources and full root access.",
    eyebrow: "Compute",
    summary: "Virtual servers with dedicated resources and root access.",
    heroTitle: "Virtual private servers with full control",
    heroLead: "Dedicated CPU, memory and storage allocations with root access, ready for your applications, control panels and custom software.",
    features:
      "Root access | Install and configure the software stack your project needs.\nDedicated allocations | Guaranteed resources assigned to your server.\nChoice of operating systems | Tell us the operating system you need when you order.\nTracked in your portal | Services, renewals and requests sit in your CONZEX portal.",
    productsTitle: "VPS plans",
    productsLead: "Select a plan and billing cycle.",
    faqs: "Do I get root access? | Yes. VPS plans include full administrative access to your server.\nCan I request a custom configuration? | Yes. Use a project request to specify resources that are not listed in our standard plans.",
    ctaTitle: "Need a custom VPS configuration?",
    ctaLead: "Tell us the resources and software you need and we will prepare a quotation.",
  },
  {
    slug: "dedicated-servers",
    path: "/servers/dedicated",
    layout: "product",
    nav: "hosting",
    productGroup: "dedicated-servers",
    projectType: "dedicated_config",
    title: "Dedicated Servers",
    meta: "Single-tenant dedicated servers from CONZEX for performance-sensitive workloads.",
    eyebrow: "Compute",
    summary: "Single-tenant physical servers for demanding workloads.",
    heroTitle: "Dedicated servers for demanding workloads",
    heroLead: "Single-tenant hardware with the full capacity of the machine reserved for your applications, databases and services.",
    features:
      "Single tenant | All hardware resources are reserved for your organisation.\nConfigurable hardware | Choose processor, memory and storage options where offered.\nFull administrative access | Run any supported operating system and software stack.\nProject-based builds | Request bespoke hardware configurations through a project request.",
    productsTitle: "Dedicated server plans",
    productsLead: "Choose a server and billing cycle.",
    faqs: "Can I specify custom hardware? | Yes. Submit a project request with your hardware requirements for a tailored quotation.",
    ctaTitle: "Planning a bespoke server build?",
    ctaLead: "Share your workload and hardware requirements and our team will respond with a proposal.",
  },
  {
    slug: "business-hosting",
    path: "/hosting/business",
    layout: "product",
    nav: "hosting",
    productGroup: "business-hosting",
    projectType: "enterprise",
    title: "Business Hosting Solutions",
    meta: "Business hosting solutions from CONZEX for organisations that need dependable infrastructure and support.",
    eyebrow: "Solutions",
    summary: "Hosting packages and services designed for organisations.",
    heroTitle: "Hosting solutions built for business",
    heroLead: "Combine hosting, domains, security and support into a solution that fits how your organisation works.",
    features:
      "Consolidated billing | Keep every service and invoice under one business account.\nTax-ready invoices | Add your company details and GSTIN to every invoice.\nSecurity options | Add SSL certificates and security services to your solution.\nDedicated proposals | Larger requirements are scoped and quoted by our team.",
    productsTitle: "Business hosting plans",
    productsLead: "Select a plan, or request a tailored solution for larger requirements.",
    faqs: "Can invoices show our company and GSTIN? | Yes. Add them under Billing details in your portal and they appear on every new invoice.",
    ctaTitle: "Need a solution for your organisation?",
    ctaLead: "Tell us about your requirements and we will prepare a proposal.",
  },
  {
    slug: "business-email",
    path: "/email",
    layout: "product",
    nav: "email",
    productGroup: "business-email",
    projectType: "other",
    title: "Business Email",
    meta: "Professional email on your own domain from CONZEX.",
    eyebrow: "Email",
    summary: "Professional mailboxes on your own domain.",
    heroTitle: "Professional email on your domain",
    heroLead: "Give your team addresses like name@yourbusiness.com, managed with your domain and billing in one CONZEX account.",
    features:
      "Your domain | Send and receive email from addresses on your own domain.\nWorks with your devices | Use webmail or connect desktop and mobile mail apps.\nDomain setup handled | DNS records for email are configured with your domain where we manage it.\nAdd mailboxes as you grow | Order additional mailboxes from your portal.",
    productsTitle: "Business email plans",
    productsLead: "Choose a plan and the domain it should use.",
    faqs: "Can I keep my current domain? | Yes. Email can use a domain registered with CONZEX or elsewhere.\nCan you move our existing mailboxes? | Yes. Submit a project request and our team will plan the migration.",
    ctaTitle: "Moving a whole team's email?",
    ctaLead: "Send a request to plan a mailbox migration.",
  },
  {
    slug: "ssl-certificates",
    path: "/security/ssl",
    layout: "product",
    nav: "email",
    productGroup: "ssl-certificates",
    projectType: "other",
    title: "SSL Certificates",
    meta: "SSL certificates from CONZEX to secure websites and build customer trust.",
    eyebrow: "Security",
    summary: "Certificates to encrypt traffic and secure your websites.",
    heroTitle: "Secure every website with SSL",
    heroLead: "Encrypt traffic between your website and its visitors, and manage certificates alongside your hosting and domains.",
    features:
      "Encrypted connections | Protect data exchanged between browsers and your website.\nValidation options | Choose the certificate type that matches your organisation where offered.\nTracked in your portal | Certificates and renewals sit in your CONZEX account.",
    productsTitle: "SSL certificates",
    productsLead: "Choose a certificate and tell us the domain it secures.",
    faqs: "Which certificate do I need? | Domain-validated certificates suit most websites. Organisations that need identity validation should choose an organisation or extended validation certificate where available.",
    ctaTitle: "Securing many domains?",
    ctaLead: "Send a request for multi-domain and organisation-wide certificate requirements.",
  },
  {
    slug: "website-security",
    path: "/security/website",
    layout: "product",
    nav: "email",
    productGroup: "website-security",
    projectType: "other",
    title: "Website Security",
    meta: "Website security services from CONZEX to help protect your website and visitors.",
    eyebrow: "Security",
    summary: "Scanning and protection for your website.",
    heroTitle: "Help keep your website secure",
    heroLead: "Add security services that check your website for threats, alongside the SSL certificates and hosting in your CONZEX account.",
    features:
      "Threat scanning | Regular checks of your website for known malware and vulnerabilities, depending on plan.\nWorks with SSL | Combine security services with an SSL certificate for encrypted connections.\nManaged with your services | Billing and requests sit alongside your hosting and domains.",
    productsTitle: "Website security plans",
    productsLead: "Choose the protection that suits your website.",
    faqs: "Do I still need an SSL certificate? | Yes. SSL encrypts connections, while security services check the website itself. Most websites benefit from both.",
    ctaTitle: "Dealing with a security issue?",
    ctaLead: "Send a request and our team will help.",
  },
  {
    slug: "website-backup",
    path: "/security/backup",
    layout: "product",
    nav: "email",
    productGroup: "website-backup",
    projectType: "other",
    title: "Website Backup",
    meta: "Website backup services from CONZEX to protect your files and databases.",
    eyebrow: "Security",
    summary: "Scheduled backups of your files and databases.",
    heroTitle: "Backups for when things go wrong",
    heroLead: "Keep copies of your website files and databases so you can restore them after a mistake, a failed update or an attack.",
    features:
      "Scheduled backups | Files and databases are backed up automatically on the schedule your plan provides.\nStraightforward restores | Restore a previous version of your website when you need to.\nSeparate from your website | Backups are stored away from the website they protect.",
    productsTitle: "Website backup plans",
    productsLead: "Choose the backup plan that suits your website.",
    faqs: "Does my hosting already include backups? | Check the features of your hosting plan. A dedicated backup service adds retention and restores that are independent of the hosting account.",
    ctaTitle: "Need a backup strategy for many websites?",
    ctaLead: "Send a request to plan backups across your services.",
  },
  {
    slug: "custom-hosting-projects",
    path: "/solutions/custom-hosting",
    layout: "solution",
    nav: "solutions",
    projectType: "custom_hosting",
    title: "Custom Hosting Projects",
    meta: "Custom hosting projects scoped, quoted and delivered by CONZEX.",
    eyebrow: "Solutions",
    summary: "Hosting environments scoped and quoted for your project.",
    heroTitle: "Hosting designed around your project",
    heroLead: "When standard plans do not fit, we scope, quote and deliver a hosting environment built for your requirements.",
    steps:
      "Submit your requirements | Describe your project, workloads and timelines in a project request.\nReview and proposal | Our team reviews the request and sends a formal proposal to your portal.\nAccept and onboard | Accept the proposal online, pay the invoice, and we begin onboarding.\nTrack delivery | Follow progress and updates from the Projects area of your portal.",
    features:
      "Formal proposals | Receive quotations you can accept online.\nTracked progress | Every update is recorded against your project.\nIntegrated billing | Accepted proposals are invoiced through your CONZEX account.",
    ctaTitle: "Start a custom hosting project",
    ctaLead: "Submit your requirements and our team will be in touch.",
  },
  {
    slug: "custom-infrastructure",
    path: "/solutions/infrastructure",
    layout: "solution",
    nav: "solutions",
    projectType: "cloud_infrastructure",
    title: "Custom Infrastructure Solutions",
    meta: "Custom cloud, VPS and dedicated infrastructure deployments from CONZEX.",
    eyebrow: "Solutions",
    summary: "Cloud, VPS and dedicated deployments designed for you.",
    heroTitle: "Infrastructure designed for your architecture",
    heroLead: "Plan cloud deployments, server clusters and enterprise environments with the CONZEX team, from requirements to onboarding.",
    features:
      "Cloud infrastructure deployments | Multi-server and cloud environments planned around your architecture.\nVPS and dedicated configurations | Bespoke resource and hardware specifications.\nEnterprise requirements | Environments for organisations with specific compliance or operational needs.\nStructured onboarding | A defined onboarding stage once your proposal is accepted.",
    steps:
      "Share your architecture | Outline your workloads, environments and constraints.\nSolution design | We assess the requirements and prepare a proposal.\nAgreement | Review and accept the proposal in your portal.\nDeployment and onboarding | We deliver the environment and track each stage in your project.",
    ctaTitle: "Plan your infrastructure with CONZEX",
    ctaLead: "Submit a project request to begin.",
  },
  {
    slug: "enterprise-solutions",
    path: "/solutions/enterprise",
    layout: "solution",
    nav: "solutions",
    projectType: "enterprise",
    title: "Enterprise Solutions",
    meta: "Enterprise hosting and infrastructure from CONZEX, scoped around your compliance, scale and support requirements.",
    eyebrow: "Solutions",
    summary: "Environments for organisations with specific operational needs.",
    heroTitle: "Infrastructure for enterprise requirements",
    heroLead: "Work with the CONZEX team on environments that meet your organisation's scale, security and operational requirements, with a single account for billing and support.",
    features:
      "Requirements-led design | Environments are planned around your workloads, policies and growth plans.\nConsolidated account | Services, invoices and requests in one CONZEX account.\nFormal proposals | Every engagement is quoted in writing and accepted online.",
    steps:
      "Share your requirements | Outline workloads, compliance needs and timelines.\nSolution design | Our team reviews the requirements and prepares a proposal.\nAgreement | Review and accept the proposal in your portal.\nDelivery | We deliver the environment and track each stage in your project.",
    ctaTitle: "Plan an enterprise environment",
    ctaLead: "Submit a project request and our team will be in touch.",
  },
  {
    slug: "professional-services",
    path: "/solutions/professional-services",
    layout: "solution",
    nav: "solutions",
    projectType: "professional_services",
    title: "Professional Services",
    meta: "Migrations, setup and configuration services from the CONZEX team.",
    eyebrow: "Solutions",
    summary: "Migrations, setup and configuration by our team.",
    heroTitle: "Expert help for migrations and setup",
    heroLead: "Hand over website migrations, server setup and configuration work to the CONZEX team, quoted up front and tracked in your portal.",
    features:
      "Website and email migrations | Move websites, databases and mailboxes from another provider.\nServer setup | Configuration of operating systems, control panels and software stacks.\nDomain and DNS changes | Planned transfers and DNS updates to avoid interruptions.\nTracked delivery | Every request is quoted and tracked in the Projects area of your portal.",
    steps:
      "Describe the work | Tell us what needs to be moved, set up or changed.\nReceive a quotation | Review the scope and price in your portal.\nApprove online | Accept the quotation to schedule the work.\nTrack progress | Follow updates on your project page until completion.",
    ctaTitle: "Need a hand with a migration?",
    ctaLead: "Describe the work and we will send a quotation.",
  },
  {
    slug: "ai",
    path: "/ai",
    layout: "ai",
    nav: "ai",
    productGroup: "ai-plans",
    title: "CONZEX AI",
    meta: "CONZEX AI is a private AI assistant for writing, coding and research, included with your CONZEX account.",
    eyebrow: "AI",
    summary: "A private AI assistant for your team.",
    heroTitle: "CONZEX AI, your private assistant",
    heroLead: "Write, code and think through problems with an assistant that keeps your history, follows your instructions and remembers only what you ask it to.",
    features:
      "Local models by default | Chats run on models hosted by CONZEX unless you choose a cloud model.\nYou decide what leaves | Cloud models stay off until you allow them in Settings.\nMemory under your control | Review, edit or delete anything it remembers.\nOne account | The same CONZEX account as your hosting and invoices.",
    productsTitle: "AI plans",
    productsLead: "Higher monthly allowances for heavier use.",
    ctaTitle: "Try CONZEX AI",
    ctaLead: "Create an account and start a chat.",
  },
  {
    slug: "faq",
    path: "/faq",
    layout: "faq",
    nav: "company",
    title: "FAQs",
    meta: "Frequently asked questions about CONZEX accounts, billing, hosting and domains.",
    eyebrow: "Resources",
    summary: "Answers to common account, billing and service questions.",
    heroTitle: "Frequently asked questions",
    heroLead: "Answers to common questions about accounts, billing, hosting and domains.",
    faqs: "How do I create an account? | Select Get started and complete the registration form.\nWhich payment methods are accepted? | Invoices are paid online through Razorpay (cards, UPI, net banking and wallets where available). Our team can also record bank transfers.\nWhere can I find my invoices? | Sign in and open Invoices in your portal to view, print and pay them.\nHow do I contact support? | Sign in and send a request, or reply on an existing project, from your portal.\nCan I upgrade my service? | Yes. Send a request from your portal and our team will move you to a larger plan.\nHow do I cancel a service? | Open the service in your portal and request cancellation. It ends when the paid term does.",
  },
  {
    slug: "support",
    path: "/support",
    layout: "support",
    nav: "company",
    title: "Support",
    meta: "Get help with your CONZEX services.",
    eyebrow: "Support",
    summary: "Requests, answers and contact options.",
    heroTitle: "How can we help?",
    heroLead: "Send a request from your portal, read the answers to common questions, or ask CONZEX AI.",
  },
  {
    slug: "about",
    path: "/about",
    layout: "about",
    nav: "company",
    title: "About Us",
    meta: "About CONZEX, a hosting and infrastructure provider.",
    eyebrow: "Company",
    summary: "Who we are and how we work.",
    heroTitle: "Infrastructure and hosting, delivered with care",
    heroLead: "CONZEX provides hosting, domains and custom infrastructure for businesses that need dependable services and a responsive team.",
    body: "CONZEX brings hosting, domains, security, custom infrastructure and AI together in a single platform, so customers can order, manage and get help for every service in one place.\n\nAlongside standard plans, our team works directly with organisations on custom hosting projects and infrastructure deployments, from initial requirements through to onboarding.",
    features:
      "One platform | Ordering, billing, service management and requests in a single customer portal.\nStandard and custom | Choose from published plans or request a tailored solution.\nTransparent proposals | Custom work is quoted formally and accepted online.\nCONZEX AI | A private AI assistant on the same account.",
    ctaTitle: "Talk to CONZEX",
    ctaLead: "Questions about our services or a custom requirement? Send us a request.",
  },
];

export function pageByPath(path: string) {
  return PAGES.find((page) => page.path === path) ?? null;
}

export function pagesIn(group: NavGroup) {
  return PAGES.filter((page) => page.nav === group);
}

/** Product groups an admin can attach plans to. */
export const PRODUCT_GROUPS = PAGES.filter((page) => page.productGroup).map((page) => ({
  slug: page.productGroup!,
  title: page.title,
  path: page.path,
}));

export function parseList(value: string | undefined) {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title!.trim(), text: rest.join("|").trim() };
    });
}
