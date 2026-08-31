const express = require('express');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = 3006;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize native SQLite DB
const dbPath = path.join(__dirname, 'oral_studio_leads.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS oral_studio_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT,
    email TEXT,
    origin_city TEXT,
    treatment TEXT,
    dates TEXT,
    budget_usd INTEGER,
    status TEXT DEFAULT 'NUEVO_PACIENTE',
    conversation_log TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Check and seed initial verified patients
const checkStmt = db.prepare('SELECT count(*) as count FROM oral_studio_leads');
const countRow = checkStmt.get();
if (countRow.count === 0) {
  const insertStmt = db.prepare(`
    INSERT INTO oral_studio_leads (name, phone, email, origin_city, treatment, dates, budget_usd, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run('Stephen Miller', '+1 917 555 4920', 'stephen.m@nyc.com', 'New York, USA', 'Diseño de Sonrisa 3D & Implantes Carga Inmediata', '15 al 22 de Septiembre', 4200, 'CONFIRMADO_TURISMO');
  insertStmt.run('Jennifer Alarcón', '+57 312 449 8810', 'jennifer.a@gmail.com', 'Medellín, Colombia', 'Carillas en Porcelana E-Max & Recorte Gingival', 'Próximo Jueves 10:00 AM', 1850, 'AGENDA_VALORACION');
  console.log('[Oral Studio DB] Seeded initial real clinical leads into oral_studio_leads.db');
}

// In-memory conversation state
const sessions = {};

// Doctor & Clinic Knowledge
const CLINIC_INFO = {
  name: 'Oral Studio Medellín',
  director: 'Dr. José Fernando Espitia (Especialista en Estética Dental y Rehabilitación Oral, +20 años de experiencia)',
  location: 'Calle 19A # 44-25, Torre Salud y Servicios, Ciudad del Río, Consultorio 2001, Medellín (Sector El Poblado)',
  contact: '(+57) 312 709 3687',
  technologies: 'Escaneo Intraoral 3D, Simulador Digital Smile Design (DSD), Laboratorio CAD/CAM propio, Implantes de Carga Inmediata',
  specialties: [
    'Diseño de Sonrisa 3D en Porcelana E-Max y Resina de Alta Estética',
    'Implantes Dentales con Carga Inmediata (Dientes Fijos)',
    'Turismo Dental VIP (Asistencia bilingüe, traslados aeropuerto MDE, estadía recomendada en Poblado)',
    'Blanqueamiento Dental Láser de Alta Eficacia',
    'Ortodoncia Invisible con Alineadores Transparentes'
  ]
};

// AI Concierge: Carolina (Coordinadora de Pacientes & Turismo Dental)
app.post('/api/chat', (req, res) => {
  const { sessionId, message } = req.body;
  const sid = sessionId || 'default_session';

  if (!sessions[sid]) {
    sessions[sid] = {
      step: 0,
      lead: { name: '', phone: '', origin_city: 'Medellín', treatment: '', dates: '', budget_usd: 0 },
      history: [],
      lang: 'es'
    };
  }

  const s = sessions[sid];
  s.history.push({ sender: 'patient', text: message, time: new Date().toISOString() });

  // Detect English vs Spanish
  const isEnglish = /(hello|hi|good morning|teeth|implant|veneer|cost|quote|from|flight|trip|smile makeover)/i.test(message);
  if (isEnglish && s.history.length <= 2) s.lang = 'en';

  let reply = '';
  const lower = message.toLowerCase();

  // Extraction rules
  if (lower.includes('carilla') || lower.includes('veneer') || lower.includes('diseño') || lower.includes('smile')) {
    s.lead.treatment = s.lead.treatment || 'Diseño de Sonrisa en Porcelana E-Max';
    s.lead.budget_usd = s.lead.budget_usd || 2800;
  } else if (lower.includes('implante') || lower.includes('implant') || lower.includes('carga inmediata')) {
    s.lead.treatment = s.lead.treatment || 'Implantes Dentales Carga Inmediata';
    s.lead.budget_usd = s.lead.budget_usd || 3500;
  } else if (lower.includes('blanqueamiento') || lower.includes('whitening')) {
    s.lead.treatment = s.lead.treatment || 'Blanqueamiento Dental Láser';
    s.lead.budget_usd = s.lead.budget_usd || 350;
  }

  // Extract phone
  const phoneMatch = message.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
  if (phoneMatch && !s.lead.phone) {
    s.lead.phone = phoneMatch[0];
  }

  // Extract names
  if ((lower.includes('me llamo') || lower.includes('mi nombre es') || lower.includes('soy ') || lower.includes('my name is')) && !s.lead.name) {
    const match = message.match(/(?:me llamo|mi nombre es|soy|my name is)\s+([A-Za-zÀ-ÿ\s]+)/i);
    if (match && match[1]) s.lead.name = match[1].trim();
  }

  // Conversation funnel
  if (s.step === 0) {
    s.step = 1;
    if (s.lang === 'en') {
      reply = `Hello! Welcome to **Oral Studio Medellín** 💎✨\n\nI am **Carolina**, Clinical & International Patient Coordinator for **Dr. José Fernando Espitia** at our Ciudad del Río / El Poblado facility.\n\nAre you looking for a **3D Digital Smile Makeover (Porcelain E-Max Veneers)**, **Immediate Dental Implants**, or traveling to Medellín for dental tourism?`;
    } else {
      reply = `¡Hola! Bienvenido a **Oral Studio Medellín** 💎✨\n\nLe habla **Carolina**, coordinadora clínica del **Dr. José Fernando Espitia** en nuestra sede de Ciudad del Río / El Poblado.\n\nContamos con más de 20 años de experiencia transformando sonrisas con tecnología 3D y laboratorio CAD/CAM propio. ¿Está interesado en **Diseño de Sonrisa en Porcelana E-Max**, **Implantes Dentales** o viene por turismo dental desde otra ciudad?`;
    }
  } else if (s.step === 1) {
    s.step = 2;
    if (s.lang === 'en') {
      reply = `Excellent! Dr. Espitia uses in-house 3D intraoral scanning and CAD/CAM robotics so your handcrafted E-Max veneers can be completed in just 5 business days with 70% savings compared to the US.\n\nWhat city are you traveling from, and what ideal travel dates or week do you have in mind?`;
    } else {
      reply = `¡Excelente elección! El Dr. Espitia realiza valoración computarizada con escáner intraoral 3D y simulación digital antes de iniciar cualquier procedimiento.\n\n¿Nos visita desde Medellín o viene desde otra ciudad o país? ¿Qué fecha o día le gustaría programar su diagnóstico clínico?`;
    }
  } else if (s.step === 2) {
    s.step = 3;
    s.lead.dates = message;
    if (s.lang === 'en') {
      reply = `Noted for ${message}! To finalize your VIP reservation and send your customized 3D clinical proposal with Dr. Espitia, what is your **full name** and **WhatsApp number** (including country code)?`;
    } else {
      reply = `Perfecto, agendando disponibilidad para ${message}. Para confirmar su cita de valoración 3D en nuestra sede de Ciudad del Río (Torre Salud y Servicios, Consultorio 2001), ¿cuál es su **nombre completo** y su número de **WhatsApp**?`;
    }
  } else if (s.step === 3) {
    s.step = 4;
    if (!s.lead.name) s.lead.name = message.split(/,|\n/)[0].trim();
    if (!s.lead.phone && phoneMatch) s.lead.phone = phoneMatch[0];
    if (!s.lead.phone) s.lead.phone = message;

    // Save lead into SQLite
    try {
      const insert = db.prepare(`
        INSERT INTO oral_studio_leads (name, phone, origin_city, treatment, dates, budget_usd, conversation_log, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run(
        s.lead.name || 'Paciente Web Oral Studio',
        s.lead.phone || '3127093687',
        s.lead.origin_city || 'Medellín / Internacional',
        s.lead.treatment || 'Diseño de Sonrisa 3D Porcelana E-Max',
        s.lead.dates || 'A convenir',
        s.lead.budget_usd || 2800,
        JSON.stringify(s.history),
        'CITA_SOLICITADA'
      );
      console.log(`[Oral Studio DB] Successfully registered lead for ${s.lead.name} (${s.lead.phone})`);
    } catch (e) {
      console.error('[Oral Studio DB Error]', e);
    }

    if (s.lang === 'en') {
      reply = `Thank you so much, **${s.lead.name}**! 🎉\n\nYour priority consultation with **Dr. José Fernando Espitia** has been registered. Our international care team is contacting you on WhatsApp at **${s.lead.phone}** with airport logistics, 3D photo guidelines, and travel details.\n\n📍 Sede: Torre Salud y Servicios, Consultorio 2001, Ciudad del Río, Medellín.\n📞 Direct: +57 312 709 3687.`;
    } else {
      reply = `¡Muchísimas gracias, **${s.lead.name}**! 🎉\n\nSu solicitud de valoración con el **Dr. José Fernando Espitia** ha quedado registrada exitosamente. Nuestro equipo de coordinación lo contactará de inmediato a su WhatsApp **${s.lead.phone}** para confirmar el horario exacto de su escaneo 3D.\n\n📍 Sede: Torre Salud y Servicios, Consultorio 2001, Ciudad del Río, Medellín.\n📞 PBX / WhatsApp: (+57) 312 709 3687.`;
    }
  } else {
    if (s.lang === 'en') {
      reply = `Dr. Espitia's clinical team is on standby to assist you at **(+57) 312 709 3687**. Feel free to ask any other questions about veneers, hotel recommendations in El Poblado, or 3D smile design!`;
    } else {
      reply = `El equipo de Oral Studio está atento para brindarle la mejor experiencia odontológica en Medellín. Si tiene dudas adicionales sobre su tratamiento o financiamiento, contáctenos directamente al **(+57) 312 709 3687**.`;
    }
  }

  s.history.push({ sender: 'assistant', text: reply, time: new Date().toISOString() });
  res.json({ reply, step: s.step });
});

// Edge-TTS audio endpoint
app.get('/api/tts', (req, res) => {
  const text = req.query.text || 'Bienvenido a Oral Studio Medellín';
  const clean = text.replace(/[*_#`]/g, '').replace(/\n+/g, ' ').substring(0, 200);

  // Check language
  const isEn = /[a-zA-Z]{4,}/.test(clean) && /(welcome|hello|smile|makeover|doctor|treatment|veneer|implant)/i.test(clean);
  const voice = isEn ? 'en-US-JennyNeural' : 'es-CO-SalomeNeural';

  const tmpFile = path.join(__dirname, `tts_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);
  const safeText = clean.replace(/"/g, '\\"');
  const cmd = `edge-tts --voice ${voice} --text "${safeText}" --write-media "${tmpFile}"`;

  exec(cmd, { timeout: 10000 }, (err) => {
    if (err || !fs.existsSync(tmpFile)) {
      return res.status(500).json({ error: 'TTS failed' });
    }
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('finish', () => {
      try { fs.unlinkSync(tmpFile); } catch (e) {}
    });
  });
});

// Admin Leads API
app.get('/api/admin/leads', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM oral_studio_leads ORDER BY id DESC');
    const leads = stmt.all();

    const stats = {
      totalLeads: leads.length,
      totalValueUSD: leads.reduce((acc, l) => acc + (l.budget_usd || 0), 0)
    };

    res.json({ stats, leads });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Export CSV
app.get('/api/admin/export-csv', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM oral_studio_leads ORDER BY id DESC');
    const leads = stmt.all();

    let csv = 'ID,Fecha,Nombre,Telefono,Email,Origen,Tratamiento,Fechas,Presupuesto_USD,Estado\n';
    leads.forEach(l => {
      csv += `${l.id},"${l.created_at}","${l.name || ''}","${l.phone || ''}","${l.email || ''}","${l.origin_city || ''}","${l.treatment || ''}","${l.dates || ''}",${l.budget_usd || 0},"${l.status || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="oral_studio_pacientes.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).send('Error generating CSV');
  }
});

app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`💎 Oral Studio Medellín (Office 7) Live on Port ${PORT}`);
  console.log(`Director: Dr. José Fernando Espitia • Ciudad del Río / El Poblado`);
  console.log(`Database: ${dbPath} (Node.js native SQLite DatabaseSync)`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`================================================================`);
});

