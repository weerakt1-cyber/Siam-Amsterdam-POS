"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Priority = "Hot" | "Warm" | "Cold";
type Stage = "new" | "screened" | "viewing" | "contract" | "closed";

type Property = {
  id: string;
  title: string;
  project: string;
  location: string;
  price: number;
  size: string;
  bedrooms: string;
  source: string;
  link: string;
  contact: string;
  features: string[];
  score: number;
  summary: string;
  createdAt: string;
};

type Lead = {
  id: string;
  name: string;
  channel: string;
  budget: number;
  location: string;
  moveIn: string;
  need: string;
  docs: string;
  score: number;
  priority: Priority;
  nextAction: string;
  reply: string;
  stage: Stage;
  createdAt: string;
};

const demoPosts = [
  `ปล่อยเช่า The Address Asoke 1 ห้องนอน 35 ตร.ม. ชั้นสูง ใกล้ MRT เพชรบุรี / Airport Link มักกะสัน เฟอร์ครบ เลี้ยงแมวได้ ราคา 32,000 บาท นัดดูห้องได้เสาร์นี้ ติดต่อ 089-555-1212`,
  `For rent Noble Refine Phrom Phong, 1BR 33 sqm, fully furnished, near BTS Phrom Phong, ready to move in. 30,000 THB/month. Line: @noble-agent`,
  `คอนโดทองหล่อ Rhythm Sukhumvit 36-38 2 ห้องนอน 45 ตร.ม. ใกล้ BTS ทองหล่อ pet friendly ราคาเช่า 42,000 บาท เจ้าของปล่อยเอง`,
];

const initialProperties: Property[] = [
  {
    id: "p-1",
    title: "The Address Asoke 1BR",
    project: "The Address Asoke",
    location: "อโศก",
    price: 32000,
    size: "35 ตร.ม.",
    bedrooms: "1 ห้องนอน",
    source: "Facebook Group",
    link: "https://facebook.com/groups/demo-post-01",
    contact: "089-555-1212",
    features: ["MRT", "Airport Link", "เลี้ยงแมวได้", "เฟอร์ครบ"],
    score: 92,
    summary: "ทำเลอโศก งบตรง ลูกค้านัดดูห้องได้เร็ว เหมาะสำหรับ lead ที่ต้องการย้ายภายใน 2 สัปดาห์",
    createdAt: "2026-05-30",
  },
  {
    id: "p-2",
    title: "Noble Refine Phrom Phong",
    project: "Noble Refine",
    location: "พร้อมพงษ์",
    price: 30000,
    size: "33 ตร.ม.",
    bedrooms: "1 ห้องนอน",
    source: "Marketplace",
    link: "https://facebook.com/marketplace/demo-02",
    contact: "Line: @noble-agent",
    features: ["BTS", "fully furnished", "พร้อมเข้าอยู่"],
    score: 88,
    summary: "ใกล้ BTS พร้อมพงษ์ ราคาต่ำกว่า budget ใช้เป็นตัวเลือกปิดดีลเร็วได้ดี",
    createdAt: "2026-05-30",
  },
];

const initialLeads: Lead[] = [
  {
    id: "l-1",
    name: "คุณมีนา",
    channel: "Facebook Inbox",
    budget: 35000,
    location: "อโศก / พร้อมพงษ์",
    moveIn: "2026-06-07",
    need: "อยากได้ 1 ห้องนอน ใกล้ BTS/MRT เลี้ยงแมวได้ นัดดูเสาร์นี้",
    docs: "ready",
    score: 91,
    priority: "Hot",
    nextAction: "ส่ง shortlist 2 ห้องและล็อกคิวดูห้องภายในวันนี้",
    reply: "มี 2 ห้องที่ตรงเงื่อนไขมากครับ เดี๋ยวผมเช็คห้องว่างแล้วล็อกคิวดูให้ได้เลย เสาร์นี้สะดวกช่วงเช้าหรือบ่ายครับ",
    stage: "viewing",
    createdAt: "2026-05-30",
  },
];

const defaultPost = demoPosts[0];

function money(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function todayText() {
  return new Date().toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function detectPrice(text: string) {
  const normalized = text.replaceAll(",", "");
  const match = normalized.match(/(\d{2,3})\s*,?\s*(\d{3})|(\d{4,6})/);
  return match ? Number((match[0] || "0").replaceAll(",", "")) : 0;
}

function detectProject(text: string) {
  const patterns = [
    /(?:The Address Asoke|Noble Refine|Rhythm Sukhumvit 36-38|Life Asoke|Ashton Asoke)/i,
    /(?:คอนโด|โครงการ)\s*([A-Za-z0-9ก-๙\s-]{4,40})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return "ระบุจากประกาศ";
}

function detectLocation(text: string) {
  const locations = ["อโศก", "พร้อมพงษ์", "ทองหล่อ", "เอกมัย", "พระราม 9", "อารีย์", "สาทร", "สุขุมวิท"];
  return locations.find((location) => text.toLowerCase().includes(location.toLowerCase())) || "ยังไม่ระบุ";
}

function detectFeatures(text: string) {
  const pairs = [
    ["BTS", /bts|บีทีเอส/i],
    ["MRT", /mrt|เอ็มอาร์ที/i],
    ["pet friendly", /pet|เลี้ยง|แมว|หมา/i],
    ["fully furnished", /fully furnished|เฟอร์|ตกแต่งครบ/i],
    ["พร้อมเข้าอยู่", /ready|พร้อมเข้า|พร้อมอยู่/i],
    ["เจ้าของปล่อยเอง", /เจ้าของ/i],
  ] as const;
  return pairs.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function detectContact(text: string) {
  const phone = text.match(/0\d{2}[-\s]?\d{3}[-\s]?\d{4}/);
  const line = text.match(/line\s*[:：]?\s*[@A-Za-z0-9_.-]+/i);
  return phone?.[0] || line?.[0] || "ต้องทักเช็คจากโพสต์";
}

function parsePropertyPost(text: string, targetBudget: number, targetLocation: string): Property {
  const price = detectPrice(text);
  const location = detectLocation(text);
  const features = detectFeatures(text);
  const budgetScore = price && price <= targetBudget ? 30 : price ? 12 : 8;
  const locationScore = targetLocation.includes(location) || text.includes(targetLocation) ? 28 : 12;
  const featureScore = Math.min(features.length * 10, 30);
  const score = Math.min(100, budgetScore + locationScore + featureScore + 10);
  const project = detectProject(text);

  return {
    id: makeId("p"),
    title: `${project} ${location !== "ยังไม่ระบุ" ? location : ""}`.trim(),
    project,
    location,
    price,
    size: text.match(/\d+\s*(?:ตร\.ม\.|sqm|sq\.m\.)/i)?.[0] || "ต้องเช็คเพิ่ม",
    bedrooms: text.match(/\d+\s*(?:ห้องนอน|br|bed)/i)?.[0] || "ต้องเช็คเพิ่ม",
    source: "Manual import / Facebook",
    link: "วางลิงก์โพสต์จริงในรอบถัดไป",
    contact: detectContact(text),
    features,
    score,
    summary:
      score >= 80
        ? "เข้า scope ดีมาก ควรเช็คห้องว่างและส่งให้ลูกค้าทันที"
        : score >= 60
          ? "น่าเก็บเป็นตัวเลือกสำรอง ต้องเช็คเงื่อนไขเพิ่ม"
          : "ยังไม่ตรง scope หลัก เหมาะเก็บไว้ในฐานข้อมูลก่อน",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

function scoreLead(input: {
  budget: number;
  moveIn: string;
  docs: string;
  need: string;
  location: string;
  channel: string;
}) {
  const need = input.need.toLowerCase();
  const urgentWords = ["วันนี้", "พรุ่งนี้", "เสาร์", "อาทิตย์", "นัดดู", "จอง", "พร้อมโอน", "ย้าย"];
  const daysToMove = input.moveIn
    ? Math.ceil((new Date(`${input.moveIn}T00:00:00`).getTime() - Date.now()) / 86400000)
    : 999;
  const urgencyScore = daysToMove <= 14 ? 25 : daysToMove <= 30 ? 18 : 8;
  const intentScore = urgentWords.some((word) => need.includes(word)) ? 28 : 12;
  const docsScore = input.docs === "ready" ? 22 : input.docs === "partial" ? 13 : 5;
  const budgetScore = input.budget >= 25000 ? 18 : 10;
  const score = Math.min(100, urgencyScore + intentScore + docsScore + budgetScore + 7);
  const priority: Priority = score >= 80 ? "Hot" : score >= 55 ? "Warm" : "Cold";
  const nextAction =
    priority === "Hot"
      ? "ส่ง shortlist และล็อกเวลานัดดูห้องทันที"
      : priority === "Warm"
        ? "ถามข้อมูลที่ยังขาด แล้วส่งตัวเลือก 2-3 ห้อง"
        : "เก็บเข้า follow-up และส่งคำถามคัดกรองเพิ่ม";
  const reply =
    priority === "Hot"
      ? `ได้ครับ ผมจะคัดห้องในโซน ${input.location} ที่อยู่ในงบ ${money(input.budget)} บาทให้ก่อน แล้วช่วยล็อกคิวดูห้องให้เร็วที่สุดครับ`
      : priority === "Warm"
        ? "ขอข้อมูลเพิ่มนิดครับ วันย้ายเข้าแน่นอนประมาณเมื่อไหร่ และมีเอกสารพร้อมทำสัญญาหรือยังครับ เดี๋ยวผมคัดห้องที่ตรงให้"
        : "รับทราบครับ เดี๋ยวผมเก็บ requirement ไว้และส่งตัวเลือกที่ใกล้เคียงให้ก่อน ถ้ามีวันย้ายเข้า/งบชัดขึ้นจะช่วยคัดได้แม่นขึ้นครับ";
  return { score, priority, nextAction, reply };
}

function createCsv(properties: Property[], leads: Lead[]) {
  const propertyRows = [
    ["PROPERTY LIST"],
    ["title", "project", "location", "price", "size", "bedrooms", "features", "score", "contact", "source"],
    ...properties.map((item) => [
      item.title,
      item.project,
      item.location,
      String(item.price),
      item.size,
      item.bedrooms,
      item.features.join("|"),
      String(item.score),
      item.contact,
      item.source,
    ]),
    [],
    ["LEAD LIST"],
    ["name", "channel", "budget", "location", "moveIn", "priority", "score", "stage", "nextAction"],
    ...leads.map((lead) => [
      lead.name,
      lead.channel,
      String(lead.budget),
      lead.location,
      lead.moveIn,
      lead.priority,
      String(lead.score),
      lead.stage,
      lead.nextAction,
    ]),
  ];
  return propertyRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
}

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function generateContractDraft(lead: Lead | undefined, property: Property | undefined) {
  return `ร่างเอกสารปิดดีล / สัญญาเช่าเบื้องต้น

หมายเหตุ: เอกสารนี้เป็น template สำหรับ demo และเตรียมข้อมูลก่อนปิดดีล ต้องให้ผู้เชี่ยวชาญตรวจในเวอร์ชันใช้งานจริง

ผู้เช่า: ${lead?.name || "____________________"}
ช่องทางลูกค้า: ${lead?.channel || "____________________"}
ทรัพย์: ${property?.title || "____________________"}
โครงการ: ${property?.project || "____________________"}
ทำเล: ${property?.location || "____________________"}
ค่าเช่าต่อเดือน: ${property?.price ? money(property.price) : "____________________"} บาท
เงินประกัน: ${property?.price ? money(property.price * 2) : "____________________"} บาท
ค่าเช่าล่วงหน้า: ${property?.price ? money(property.price) : "____________________"} บาท
วันเริ่มสัญญา: ____________________
วันสิ้นสุดสัญญา: ____________________

เงื่อนไขสำคัญ
- ผู้เช่ารับผิดชอบค่าน้ำ ค่าไฟ อินเทอร์เน็ต และค่าใช้จ่ายส่วนตัว
- ตรวจสภาพห้องก่อนรับมอบ และแนบรูปถ่ายก่อนส่งมอบ
- หากมีสัตว์เลี้ยง ต้องระบุจำนวนและเงื่อนไขเจ้าของห้องก่อนเซ็น

Closing Checklist
[ ] เช็คห้องว่างกับเจ้าของ/agency partner
[ ] ยืนยันราคาและยอดแรกเข้า
[ ] ตรวจบัตร/พาสปอร์ตผู้เช่า
[ ] นัดเวลาชำระเงินและเซ็นเอกสาร
[ ] ส่งเอกสารให้คู่สัญญาตรวจทาน
[ ] บันทึกดีลลง Google Sheets / CRM`;
}

export default function Home() {
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [postText, setPostText] = useState(defaultPost);
  const [targetBudget, setTargetBudget] = useState(35000);
  const [targetLocation, setTargetLocation] = useState("อโศก พร้อมพงษ์ ทองหล่อ");
  const [leadForm, setLeadForm] = useState({
    name: "คุณลูกค้าทดลอง",
    channel: "Facebook Inbox",
    budget: 35000,
    location: "อโศก / พร้อมพงษ์",
    moveIn: "2026-06-07",
    docs: "ready",
    need: "อยากได้ 1 ห้องนอน ใกล้ BTS/MRT เลี้ยงแมวได้ นัดดูเสาร์นี้",
  });
  const [selectedLeadId, setSelectedLeadId] = useState(initialLeads[0].id);
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialProperties[0].id);
  const [contractDraft, setContractDraft] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProperties(readStorage("agentops.properties", initialProperties));
      setLeads(readStorage("agentops.leads", initialLeads));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("agentops.properties", JSON.stringify(properties));
  }, [properties]);

  useEffect(() => {
    window.localStorage.setItem("agentops.leads", JSON.stringify(leads));
  }, [leads]);

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) || leads[0];
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId) || properties[0];

  const metrics = useMemo(() => {
    const hotLeads = leads.filter((lead) => lead.priority === "Hot").length;
    const avgScore = properties.length
      ? Math.round(properties.reduce((sum, item) => sum + item.score, 0) / properties.length)
      : 0;
    return [
      { label: "ทรัพย์ใน shortlist", value: `${properties.length}`, detail: `avg match ${avgScore}%` },
      { label: "Hot leads", value: `${hotLeads}`, detail: "ควร follow-up วันนี้" },
      { label: "เอกสารพร้อมร่าง", value: `${Math.min(properties.length, leads.length)}`, detail: "ใช้ปิดดีลหน้างาน" },
      { label: "แพ็กเกจขายจริง", value: "Pro DFY", detail: "setup + monthly" },
    ];
  }, [leads, properties]);

  function addParsedProperty() {
    const parsed = parsePropertyPost(postText, targetBudget, targetLocation);
    setProperties((current) => [parsed, ...current]);
    setSelectedPropertyId(parsed.id);
  }

  function addDemoPost(index: number) {
    setPostText(demoPosts[index]);
  }

  function addLead() {
    const result = scoreLead(leadForm);
    const lead: Lead = {
      id: makeId("l"),
      name: leadForm.name,
      channel: leadForm.channel,
      budget: Number(leadForm.budget),
      location: leadForm.location,
      moveIn: leadForm.moveIn,
      need: leadForm.need,
      docs: leadForm.docs,
      score: result.score,
      priority: result.priority,
      nextAction: result.nextAction,
      reply: result.reply,
      stage: result.priority === "Hot" ? "screened" : "new",
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setLeads((current) => [lead, ...current]);
    setSelectedLeadId(lead.id);
  }

  function updateLeadStage(id: string, stage: Stage) {
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, stage } : lead)));
  }

  function buildContract() {
    const draft = generateContractDraft(selectedLead, selectedProperty);
    setContractDraft(draft);
  }

  function exportCsv() {
    downloadText("agentops-trial-export.csv", createCsv(properties, leads), "text/csv;charset=utf-8");
  }

  function resetDemo() {
    setProperties(initialProperties);
    setLeads(initialLeads);
    setSelectedLeadId(initialLeads[0].id);
    setSelectedPropertyId(initialProperties[0].id);
    setContractDraft("");
  }

  return (
    <main className="min-h-screen bg-[#f6f7f4] text-[#17211c]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-[#dfe5dd] bg-[#111c17] p-6 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-[#e7f1e8] font-black text-[#174a34]">AO</div>
          <div>
            <p className="text-xs font-bold uppercase text-[#aab9af]">Real estate agent ops</p>
            <h1 className="text-2xl font-black">AgentOps</h1>
          </div>
        </div>

        <nav className="mt-10 grid gap-2 text-sm font-bold text-[#d8e2dc]">
          <a className="rounded-lg bg-[#203229] px-4 py-3 text-white" href="#dashboard">
            Dashboard
          </a>
          <a className="rounded-lg px-4 py-3 hover:bg-[#203229]" href="#property-scout">
            Property Scout
          </a>
          <a className="rounded-lg px-4 py-3 hover:bg-[#203229]" href="#lead-screening">
            Lead Screening
          </a>
          <a className="rounded-lg px-4 py-3 hover:bg-[#203229]" href="#contract-desk">
            Contract Desk
          </a>
          <a className="rounded-lg px-4 py-3 hover:bg-[#203229]" href="#proof-brief">
            Proof Brief
          </a>
        </nav>

        <div className="mt-auto rounded-lg border border-white/15 bg-white/5 p-4">
          <p className="text-xs font-bold uppercase text-[#aab9af]">Trial status</p>
          <strong className="mt-1 block text-2xl">{todayText()}</strong>
          <p className="mt-2 text-sm leading-6 text-[#c6d0ca]">Local MVP สำหรับทดลอง process เองก่อนต่อ API จริง</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <section id="dashboard" className="px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex flex-col gap-4 border-b border-[#dfe5dd] pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-[#68716d]">Private MVP Trial Console</p>
              <h2 className="mt-2 max-w-4xl text-4xl font-black leading-tight tracking-normal sm:text-5xl">
                ระบบทดลองสำหรับพิสูจน์ว่า Agent ลดงานซ้ำและปิดดีลเร็วขึ้นได้จริง
              </h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#68716d]">
                ใช้เองก่อนเพื่อทำ demo ลูกค้า: วางประกาศจาก Facebook, คัดทรัพย์, screen lead, สร้างข้อความตอบ,
                ร่างเอกสารปิดดีล และ export เป็นไฟล์สำหรับทำ slide หรือ Google Sheets
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-lg border border-[#dfe5dd] bg-white px-4 py-3 font-bold" onClick={resetDemo}>
                Reset Demo
              </button>
              <button className="rounded-lg bg-[#276749] px-4 py-3 font-bold text-white" onClick={exportCsv}>
                Export CSV
              </button>
            </div>
          </header>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <article key={metric.label} className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
                <p className="text-sm font-bold text-[#68716d]">{metric.label}</p>
                <strong className="mt-2 block text-3xl font-black">{metric.value}</strong>
                <span className="mt-2 block text-sm text-[#68716d]">{metric.detail}</span>
              </article>
            ))}
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase text-[#68716d]">Operating model</p>
                  <h3 className="mt-1 text-2xl font-black">Done-for-you MVP pipeline</h3>
                </div>
                <span className="rounded-full bg-[#e9f1ed] px-3 py-2 text-xs font-black text-[#174a34]">
                  Ready to demo
                </span>
              </div>
              <div className="mt-5 overflow-hidden rounded-lg border border-[#dfe5dd] bg-[#fbfcfb]">
                <Image
                  src="/agentops-system-map.svg"
                  alt="AgentOps process map"
                  width={1200}
                  height={620}
                  priority
                  className="h-auto w-full"
                />
              </div>
            </article>

            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase text-[#68716d]">Demo script</p>
              <h3 className="mt-1 text-2xl font-black">ใช้พูดกับลูกค้า</h3>
              <div className="mt-5 grid gap-3 text-sm leading-6 text-[#4b5751]">
                <p className="rounded-lg bg-[#f7faf7] p-4">
                  1. วางโพสต์ทรัพย์จาก Facebook แล้วระบบดึงราคา ทำเล เงื่อนไข และคะแนนความตรงกับลูกค้า
                </p>
                <p className="rounded-lg bg-[#f7faf7] p-4">
                  2. ใส่ข้อมูลลูกค้า ระบบจัด priority เป็น Hot/Warm/Cold พร้อมข้อความตอบกลับ
                </p>
                <p className="rounded-lg bg-[#f7faf7] p-4">
                  3. เลือกลูกค้าและทรัพย์ แล้วสร้างเอกสารปิดดีลเบื้องต้นภายในไม่กี่นาที
                </p>
              </div>
            </article>
          </div>
        </section>

        <section id="property-scout" className="px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-[#68716d]">Workflow 1</p>
              <h3 className="text-3xl font-black">Property Scout</h3>
            </div>
            <div className="flex gap-2">
              {demoPosts.map((_, index) => (
                <button
                  key={index}
                  className="rounded-lg border border-[#dfe5dd] bg-white px-3 py-2 text-sm font-bold"
                  onClick={() => addDemoPost(index)}
                >
                  Demo {index + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <label className="grid gap-2 text-sm font-bold">
                Scope ทำเล
                <input
                  className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                  value={targetLocation}
                  onChange={(event) => setTargetLocation(event.target.value)}
                />
              </label>
              <label className="mt-4 grid gap-2 text-sm font-bold">
                Budget สูงสุด
                <input
                  className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                  type="number"
                  value={targetBudget}
                  onChange={(event) => setTargetBudget(Number(event.target.value))}
                />
              </label>
              <label className="mt-4 grid gap-2 text-sm font-bold">
                วางข้อความประกาศ / post caption
                <textarea
                  className="min-h-52 rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3 leading-7"
                  value={postText}
                  onChange={(event) => setPostText(event.target.value)}
                />
              </label>
              <button className="mt-4 w-full rounded-lg bg-[#276749] px-4 py-3 font-bold text-white" onClick={addParsedProperty}>
                Extract & Add to Shortlist
              </button>
              <p className="mt-3 text-xs leading-5 text-[#68716d]">
                MVP นี้ใช้ manual import เพื่อหลีกเลี่ยงความเสี่ยงจาก scraping Facebook/Marketplace โดยตรง
              </p>
            </article>

            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-black">Shortlist Database</h4>
                <span className="rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-black text-[#2f5f98]">
                  {properties.length} properties
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {properties.map((property) => (
                  <button
                    key={property.id}
                    className={`rounded-lg border p-4 text-left transition ${
                      selectedPropertyId === property.id
                        ? "border-[#276749] bg-[#f0f8f2]"
                        : "border-[#dfe5dd] bg-[#fbfcfb] hover:border-[#9bb9a4]"
                    }`}
                    onClick={() => setSelectedPropertyId(property.id)}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h5 className="text-lg font-black">{property.title}</h5>
                        <p className="mt-1 text-sm text-[#68716d]">
                          {property.location} | {property.size} | {property.bedrooms} | {money(property.price)} บาท
                        </p>
                        <p className="mt-2 text-sm leading-6 text-[#4b5751]">{property.summary}</p>
                      </div>
                      <strong className="w-fit rounded-full bg-white px-3 py-2 text-sm text-[#174a34] shadow-sm">
                        {property.score}% match
                      </strong>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {property.features.map((feature) => (
                        <span key={feature} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#4b5751]">
                          {feature}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section id="lead-screening" className="px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-[#68716d]">Workflow 2</p>
            <h3 className="text-3xl font-black">Lead Screening</h3>
          </div>

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <div className="grid gap-4">
                <label className="grid gap-2 text-sm font-bold">
                  ชื่อลูกค้า
                  <input
                    className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                    value={leadForm.name}
                    onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Channel
                  <select
                    className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                    value={leadForm.channel}
                    onChange={(event) => setLeadForm({ ...leadForm, channel: event.target.value })}
                  >
                    <option>Facebook Inbox</option>
                    <option>LINE OA</option>
                    <option>Agent Partner</option>
                    <option>Referral</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  Budget
                  <input
                    className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                    type="number"
                    value={leadForm.budget}
                    onChange={(event) => setLeadForm({ ...leadForm, budget: Number(event.target.value) })}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  ทำเล
                  <input
                    className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                    value={leadForm.location}
                    onChange={(event) => setLeadForm({ ...leadForm, location: event.target.value })}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  วันย้ายเข้า
                  <input
                    className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                    type="date"
                    value={leadForm.moveIn}
                    onChange={(event) => setLeadForm({ ...leadForm, moveIn: event.target.value })}
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  เอกสาร
                  <select
                    className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                    value={leadForm.docs}
                    onChange={(event) => setLeadForm({ ...leadForm, docs: event.target.value })}
                  >
                    <option value="ready">พร้อม</option>
                    <option value="partial">บางส่วน</option>
                    <option value="none">ยังไม่พร้อม</option>
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  ข้อความจากลูกค้า
                  <textarea
                    className="min-h-32 rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3 leading-7"
                    value={leadForm.need}
                    onChange={(event) => setLeadForm({ ...leadForm, need: event.target.value })}
                  />
                </label>
              </div>
              <button className="mt-4 w-full rounded-lg bg-[#276749] px-4 py-3 font-bold text-white" onClick={addLead}>
                Score Lead & Generate Reply
              </button>
            </article>

            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-black">Lead Pipeline</h4>
                <span className="rounded-full bg-[#e9f1ed] px-3 py-1 text-xs font-black text-[#174a34]">
                  {leads.length} leads
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {leads.map((lead) => (
                  <article
                    key={lead.id}
                    className={`rounded-lg border p-4 ${
                      selectedLeadId === lead.id ? "border-[#276749] bg-[#f0f8f2]" : "border-[#dfe5dd] bg-[#fbfcfb]"
                    }`}
                  >
                    <button className="w-full text-left" onClick={() => setSelectedLeadId(lead.id)}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h5 className="text-lg font-black">{lead.name}</h5>
                          <p className="mt-1 text-sm text-[#68716d]">
                            {lead.channel} | {lead.location} | งบ {money(lead.budget)} บาท
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[#4b5751]">{lead.nextAction}</p>
                        </div>
                        <strong
                          className={`w-fit rounded-full px-3 py-2 text-sm ${
                            lead.priority === "Hot"
                              ? "bg-[#ffeceb] text-[#a64343]"
                              : lead.priority === "Warm"
                                ? "bg-[#fff5df] text-[#976111]"
                                : "bg-[#eef4ff] text-[#2f5f98]"
                          }`}
                        >
                          {lead.priority} {lead.score}/100
                        </strong>
                      </div>
                      <p className="mt-3 rounded-lg bg-white p-3 text-sm leading-6 text-[#4b5751]">{lead.reply}</p>
                    </button>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["new", "screened", "viewing", "contract", "closed"] as Stage[]).map((stage) => (
                        <button
                          key={stage}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            lead.stage === stage ? "bg-[#276749] text-white" : "bg-white text-[#4b5751]"
                          }`}
                          onClick={() => updateLeadStage(lead.id, stage)}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section id="contract-desk" className="px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-[#68716d]">Workflow 3</p>
            <h3 className="text-3xl font-black">Contract Desk</h3>
          </div>

          <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <label className="grid gap-2 text-sm font-bold">
                เลือก Lead
                <select
                  className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                  value={selectedLeadId}
                  onChange={(event) => setSelectedLeadId(event.target.value)}
                >
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.name} - {lead.priority}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 grid gap-2 text-sm font-bold">
                เลือกทรัพย์
                <select
                  className="rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] px-3 py-3"
                  value={selectedPropertyId}
                  onChange={(event) => setSelectedPropertyId(event.target.value)}
                >
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.title} - {money(property.price)} บาท
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-5 rounded-lg bg-[#f7faf7] p-4 text-sm leading-7 text-[#4b5751]">
                <strong className="block text-[#17211c]">Closing context</strong>
                ลูกค้า: {selectedLead?.name || "-"}
                <br />
                ทรัพย์: {selectedProperty?.title || "-"}
                <br />
                ราคา: {selectedProperty ? money(selectedProperty.price) : "-"} บาท
                <br />
                Priority: {selectedLead?.priority || "-"}
              </div>
              <button className="mt-4 w-full rounded-lg bg-[#276749] px-4 py-3 font-bold text-white" onClick={buildContract}>
                Generate Closing Draft
              </button>
              <button
                className="mt-3 w-full rounded-lg border border-[#dfe5dd] bg-white px-4 py-3 font-bold"
                onClick={() => downloadText("agentops-contract-draft.txt", contractDraft || generateContractDraft(selectedLead, selectedProperty))}
              >
                Download Draft
              </button>
            </article>

            <article className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-black">Document Preview</h4>
                <button
                  className="rounded-lg border border-[#dfe5dd] bg-white px-3 py-2 text-sm font-bold"
                  onClick={() => navigator.clipboard?.writeText(contractDraft || generateContractDraft(selectedLead, selectedProperty))}
                >
                  Copy
                </button>
              </div>
              <pre className="mt-4 max-h-[680px] overflow-auto rounded-lg border border-[#dfe5dd] bg-[#fbfcfb] p-5 text-sm leading-7 text-[#25342d] whitespace-pre-wrap">
                {contractDraft || generateContractDraft(selectedLead, selectedProperty)}
              </pre>
            </article>
          </div>
        </section>

        <section id="proof-brief" className="px-5 py-8 sm:px-8 lg:px-10">
          <div className="mb-4">
            <p className="text-xs font-black uppercase text-[#68716d]">For sales deck</p>
            <h3 className="text-3xl font-black">Proof Brief</h3>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            {[
              {
                title: "Pain Point",
                body: "Agent เสียเวลาหาทรัพย์ซ้ำ ตอบลูกค้าช้า ไม่รู้ว่า lead จริงจังแค่ไหน และเสียจังหวะตอนลูกค้าพร้อมเซ็น",
              },
              {
                title: "MVP Solution",
                body: "ระบบเดียวสำหรับวางประกาศ คัดทรัพย์ คัดลูกค้า สร้างข้อความตอบ และออกเอกสารปิดดีลเบื้องต้น",
              },
              {
                title: "Offer",
                body: "ขายเป็น Done-for-you Pro: setup 15,000-25,000 บาท และรายเดือน 7,900-12,900 บาท",
              },
            ].map((item) => (
              <article key={item.title} className="rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase text-[#68716d]">Slide block</p>
                <h4 className="mt-1 text-2xl font-black">{item.title}</h4>
                <p className="mt-4 text-sm leading-7 text-[#4b5751]">{item.body}</p>
              </article>
            ))}
          </div>

          <article className="mt-5 rounded-lg border border-[#dfe5dd] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-[#68716d]">Next real integration</p>
                <h4 className="mt-1 text-2xl font-black">สิ่งที่ต้องต่อหลัง demo ผ่าน</h4>
              </div>
              <button className="rounded-lg bg-[#276749] px-4 py-3 font-bold text-white" onClick={exportCsv}>
                Export proof data
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {["Google Sheets API", "OpenAI extraction", "LINE OA webhook", "Google Docs/PDF"].map((item) => (
                <div key={item} className="rounded-lg bg-[#f7faf7] p-4 text-sm font-bold text-[#4b5751]">
                  {item}
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
