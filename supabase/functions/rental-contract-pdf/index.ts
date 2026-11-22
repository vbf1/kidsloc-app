import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type ContractRow = {
  id: string;
  company_id: string;
  contract_number: number;
  status: string;
  contract_snapshot: Record<string, any>;
  signed_at: string | null;
  signer_name: string | null;
  signer_document: string | null;
  signer_phone: string | null;
  signature_svg: string | null;
  consent_text: string | null;
  signed_pdf_path: string | null;
  rental_id: string | null;
};

function clean(value: unknown, max = 1200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[·×—–]/g, "-").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .slice(0, max).trim();
}
function dateBr(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return "Nao informado";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + "T12:00:00") : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? clean(raw, 80) : parsed.toLocaleDateString("pt-BR");
}
function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function signaturePoints(svg: string) {
  const match = svg.match(/<path[^>]*d="([^"]+)"/i);
  const d = match?.[1] ?? "";
  if (!d || !/^[MLml0-9.\s-]+$/.test(d)) throw new Error("Traçado da assinatura inválido.");
  const points = [...d.matchAll(/([ML])\s*([0-9.]+)\s+([0-9.]+)/g)].map((m) => ({
    command: m[1], x: Number(m[2]), y: Number(m[3]),
  }));
  if (points.length < 2 || points.length > 2500 || points.some((p) =>
    !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 600 || p.y < 0 || p.y > 180
  )) throw new Error("Coordenadas da assinatura inválidas.");
  return points;
}
async function buildPdf(c: ContractRow) {
  const snap = c.contract_snapshot ?? {};
  const company = snap.company ?? {};
  const customer = snap.customer ?? {};
  const rental = snap.rental ?? {};
  const items = Array.isArray(snap.items) ? snap.items.slice(0, 60) : [];
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.16, 0.22);
  const purple = rgb(0.39, 0.25, 0.67);
  const muted = rgb(0.40, 0.43, 0.49);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const margin = 48;
  const maxWidth = 499;
  const newPage = () => { page = pdf.addPage([595.28, 841.89]); y = 790; };
  const write = (value: unknown, options: { bold?: boolean; size?: number; color?: typeof ink; indent?: number } = {}) => {
    const text = clean(value, 3000);
    if (!text) return;
    const size = options.size ?? 9;
    const font = options.bold ? bold : regular;
    const x = margin + (options.indent ?? 0);
    const width = maxWidth - (options.indent ?? 0);
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) > width && line) {
        if (y < 62) newPage();
        page.drawText(line, { x, y, size, font, color: options.color ?? ink });
        y -= size + 5;
        line = word;
      } else line = candidate;
    }
    if (line) {
      if (y < 62) newPage();
      page.drawText(line, { x, y, size, font, color: options.color ?? ink });
      y -= size + 6;
    }
  };
  const heading = (text: string) => {
    y -= 5;
    write(text, { bold: true, size: 10, color: purple });
  };
  const field = (label: string, value: unknown) => write(label + ": " + (clean(value, 500) || "Nao informado"), { size: 8.5, indent: 5 });
  page.drawRectangle({ x: 0, y: 829, width: 595.28, height: 12, color: purple });
  write(company.name ?? "Contrato de locacao", { bold: true, size: 10, color: purple });
  write("CONTRATO DE LOCACAO DE BRINQUEDOS E EQUIPAMENTOS", { bold: true, size: 16 });
  write("Contrato numero " + c.contract_number + " - Via assinada eletronicamente", { size: 9, color: muted });
  page.drawLine({ start: { x: margin, y: y - 2 }, end: { x: 547, y: y - 2 }, thickness: 2, color: purple });
  y -= 18;

  heading("1. IDENTIFICACAO DAS PARTES - LOCADORA");
  field("Nome / razao social", company.legal_name ?? company.name);
  field("CNPJ / CPF", company.document);
  field("Telefone", company.phone);
  field("E-mail", company.email);
  field("Endereco", company.address);
  field("CEP", company.zip);

  heading("2. IDENTIFICACAO DO LOCATARIO");
  field("Nome", customer.name ?? c.signer_name);
  field("CPF / documento", customer.cpf ?? c.signer_document);
  field("Telefone", customer.phone ?? c.signer_phone);
  field("E-mail", customer.email);
  field("Endereco", [customer.address, customer.neighborhood, customer.city_state, customer.zip].filter(Boolean).join(" - "));

  heading("3. DATA E LOCAL DO EVENTO");
  field("Data", dateBr(rental.start_date) + (rental.end_date && rental.end_date !== rental.start_date ? " ate " + dateBr(rental.end_date) : ""));
  field("Horario", (rental.start_time || "Nao informado") + " as " + (rental.end_time || "Nao informado"));
  field("Entrega", rental.delivery_method === "delivery" ? rental.delivery_address : "Retirada pelo LOCATARIO");

  heading("4. ITENS E VALORES CONTRATADOS");
  items.forEach((item: any) => write(
    clean(item.name, 180) + " | Quantidade: " + Number(item.quantity ?? 0) +
    " | Unitario: " + money(item.unit_price) + " | Subtotal: " + money(item.subtotal),
    { size: 8.5, indent: 5 },
  ));
  field("Taxa de entrega", money(rental.delivery_fee));
  field("Desconto", money(rental.discount));
  write("VALOR TOTAL: " + money(rental.total_amount), { bold: true, size: 11, color: purple });

  heading("5. CLAUSULAS E CONDICOES");
  const clauses = [
    ["CLAUSULA 1 - DO OBJETO", "A LOCADORA disponibilizara ao LOCATARIO os brinquedos, equipamentos e servicos descritos neste contrato, para utilizacao no evento e durante o periodo aqui indicados. Os itens, quantidades e valores constam no quadro de itens e na identificacao da locacao."],
    ["CLAUSULA 2 - DA DATA E DO LOCAL DO EVENTO", "A locacao observara a data, os horarios e o endereco informados neste instrumento. Qualquer alteracao de data, horario ou local devera ser comunicada previamente a LOCADORA e dependera de confirmacao entre as partes."],
    ["CLAUSULA 3 - DO VALOR E DA FORMA DE PAGAMENTO", "O valor total e a composicao do preco estao discriminados neste contrato. Eventual sinal, entrada, saldo, vencimentos e meios de pagamento deverao corresponder aos valores registrados na locacao ou ao que as partes ajustarem por escrito. A reserva da data sera considerada confirmada conforme a condicao de pagamento previamente acordada entre as partes."],
    ["CLAUSULA 4 - DA ENTREGA, MONTAGEM E UTILIZACAO", "A LOCADORA realizara a entrega, montagem e retirada dos equipamentos quando esses servicos fizerem parte da locacao, observando os horarios combinados. O LOCATARIO devera disponibilizar espaco adequado, nivelado e seguro para a instalacao e informar previamente restricoes de acesso, escadas, cobertura, tomadas ou outras condicoes relevantes. Os equipamentos deverao ser utilizados conforme as orientacoes de seguranca fornecidas pela LOCADORA. Equipamentos que exijam operacao especifica deverao ser manuseados somente por pessoa orientada e autorizada, e brinquedos deverao contar com supervisao adequada de um adulto responsavel."],
    ["CLAUSULA 5 - DAS RESPONSABILIDADES DAS PARTES", "A LOCADORA devera disponibilizar os itens em condicoes adequadas de uso e prestar as orientacoes necessarias a utilizacao segura. O LOCATARIO compromete-se a zelar pelos equipamentos e comunicar imediatamente qualquer falha, acidente ou dano. Danos decorrentes de uso inadequado ou do descumprimento comprovado das orientacoes poderao ser apurados e cobrados mediante demonstracao dos prejuizos efetivamente causados, respeitada a legislacao aplicavel. Nao sera atribuida ao LOCATARIO responsabilidade por desgaste natural ou defeito nao causado por sua conduta."],
    ["CLAUSULA 6 - DO CANCELAMENTO E DA ALTERACAO DA DATA", "Pedidos de cancelamento ou alteracao deverao ser comunicados a LOCADORA assim que possivel. As partes buscarao uma solucao de comum acordo, considerando a antecedencia do aviso, os custos efetivamente realizados e a possibilidade de remarcacao. Eventual retencao ou devolucao de valores devera respeitar a legislacao aplicavel e os direitos do consumidor."],
    ["CLAUSULA 7 - DAS DISPOSICOES GERAIS", "Qualquer alteracao das condicoes deste contrato devera ser acordada entre as partes, preferencialmente por escrito. Este instrumento registra as condicoes da locacao e, juntamente com os dados e itens nele descritos, passa a produzir efeitos apos a aceitacao das partes."],
    ["CLAUSULA 8 - DA ASSINATURA", "As partes poderao assinar este instrumento de forma fisica ou eletronica, desde que seja possivel identificar os signatarios e preservar a integridade do documento. Cada parte devera ter acesso a uma copia do contrato assinado."],
  ];
  for (const [title, body] of clauses) { write(title, { bold: true, size: 8.5, color: purple }); write(body, { size: 8 }); }
  if (clean(snap.terms, 5000)) { write("CONDICOES ADICIONAIS ACORDADAS", { bold: true, size: 8.5, color: purple }); write(snap.terms, { size: 8 }); }

  heading("6. REGISTRO DA ASSINATURA ELETRONICA");
  field("Assinado por", c.signer_name);
  field("Documento", c.signer_document);
  field("Telefone", c.signer_phone);
  field("Data e hora", c.signed_at ? new Date(c.signed_at).toLocaleString("pt-BR") : "Registrada no sistema");
  field("Consentimento", c.consent_text);
  if (c.signature_svg) {
    y -= 5;
    write("Assinatura manuscrita registrada:", { bold: true, size: 8.5 });
    if (y < 150) newPage();
    const points = signaturePoints(c.signature_svg);
    const originX = 60;
    const originY = y - 8;
    let previous: { x: number; y: number } | null = null;
    for (const point of points) {
      if (point.command === "M" || !previous) previous = point;
      else {
        page.drawLine({
          start: { x: originX + previous.x * 0.72, y: originY - previous.y * 0.42 },
          end: { x: originX + point.x * 0.72, y: originY - point.y * 0.42 },
          thickness: 1.5, color: ink,
        });
        previous = point;
      }
    }
    y -= 105;
  }
  pdf.getPages().forEach((p, index) => {
    p.drawLine({ start: { x: margin, y: 38 }, end: { x: 547, y: 38 }, thickness: 0.5, color: rgb(0.82, 0.82, 0.85) });
    p.drawText("KidsLoc - Contrato " + c.contract_number, { x: margin, y: 24, size: 7, font: regular, color: muted });
    p.drawText("Pagina " + (index + 1), { x: 500, y: 24, size: 7, font: regular, color: muted });
  });
  return await pdf.save();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Metodo nao permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return json({ error: "Servico indisponivel." }, 500);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const body = await req.json();
    let contract: ContractRow | null = null;
    if (typeof body.token === "string" && body.token.length >= 40 && body.token.length <= 200) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.token));
      const hash = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const { data, error } = await admin.from("rental_contracts")
        .select("id,company_id,contract_number,status,contract_snapshot,signed_at,signer_name,signer_document,signer_phone,signature_svg,consent_text,signed_pdf_path,rental_id")
        .eq("token_hash", hash).eq("status", "signed").maybeSingle();
      if (error || !data) return json({ error: "Contrato assinado nao encontrado para este link." }, 404);
      contract = data as ContractRow;
    } else if (typeof body.contract_id === "string") {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) return json({ error: "Sessao necessaria para gerar o documento." }, 401);
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData.user) return json({ error: "Sessao invalida." }, 401);
      const { data: row, error } = await userClient.from("rental_contracts")
        .select("id,company_id,contract_number,status,contract_snapshot,signed_at,signer_name,signer_document,signer_phone,signature_svg,consent_text,signed_pdf_path,rental_id")
        .eq("id", body.contract_id).eq("status", "signed").maybeSingle();
      if (error || !row) return json({ error: "Contrato assinado nao encontrado ou sem permissao." }, 404);
      const { data: membership } = await userClient.from("company_members")
        .select("role").eq("company_id", row.company_id).eq("user_id", userData.user.id).maybeSingle();
      if (!membership || !["owner", "admin"].includes(membership.role)) {
        return json({ error: "Somente o administrador da empresa pode recuperar o PDF." }, 403);
      }
      contract = row as ContractRow;
    } else {
      return json({ error: "Informe um link de assinatura valido ou um contrato." }, 400);
    }

    const path = contract.company_id + "/" + contract.id + "/contrato-assinado-kidsloc.pdf";
    if (!contract.signed_pdf_path) {
      const bytes = await buildPdf(contract);
      const { error: uploadError } = await admin.storage.from("rental-contracts").upload(path, bytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) return json({ error: "Nao foi possivel armazenar o PDF assinado." }, 500);
      const { error: updateError } = await admin.from("rental_contracts")
        .update({ signed_pdf_path: path, updated_at: new Date().toISOString() })
        .eq("id", contract.id).eq("status", "signed");
      if (updateError) {
        await admin.storage.from("rental-contracts").remove([path]);
        return json({ error: "PDF criado, mas nao foi possivel vincular ao contrato." }, 500);
      }
    } else {
      const { data: existing } = await admin.storage.from("rental-contracts").createSignedUrl(contract.signed_pdf_path, 3600);
      if (existing?.signedUrl) return json({ success: true, signed_url: existing.signedUrl });
      const bytes = await buildPdf(contract);
      const { error: uploadError } = await admin.storage.from("rental-contracts").upload(path, bytes, {
        contentType: "application/pdf", upsert: true,
      });
      if (uploadError) return json({ error: "Nao foi possivel recuperar o PDF armazenado." }, 500);
      await admin.from("rental_contracts").update({ signed_pdf_path: path, updated_at: new Date().toISOString() }).eq("id", contract.id);
    }
    const { data: signed, error: signedError } = await admin.storage.from("rental-contracts").createSignedUrl(path, 3600);
    if (signedError || !signed?.signedUrl) return json({ error: "PDF armazenado, mas nao foi possivel criar o link de acesso." }, 500);
    return json({ success: true, signed_url: signed.signedUrl });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Nao foi possivel gerar o PDF." }, 400);
  }
});
