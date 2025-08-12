// PF2e – Party-XP per Dropdown vergeben, Ziel: Party-Actor (Foundry VTT v13+)
// Autor: Foundry Pathfinder Coder

// --- Konfiguration: feste Optionen (pro Charakter) --------------------------
const XP_OPTIONS = [
  { key: "trivial",  label: "Trivial – 30 XP",   value: 30  },
  { key: "low",      label: "Low – 60 XP",       value: 60  },
  { key: "moderate", label: "Moderate – 80 XP",  value: 80  },
  { key: "severe",   label: "Severe – 120 XP",   value: 120 },
  { key: "extreme",  label: "Extreme – 160 XP",   value: 160 },
];

// --- Helfer -----------------------------------------------------------------
const applyXPPerCharacter = async (actor, deltaXP) => {
  if (!deltaXP) return;

  const currentXP = actor.system?.details?.xp?.value ?? 0;
  const currentLevel = actor.system?.details?.level?.value ?? 1;

  let newXP = currentXP + deltaXP;
  let newLevel = currentLevel;

  if (newXP >= 1000) {
    newLevel += Math.floor(newXP / 1000);
    newXP = newXP % 1000;
  }
  if (newXP < 0) newXP = 0; // Kein automatisches Downgrade

  const update = {};
  if (newLevel !== currentLevel)
    foundry.utils.setProperty(update, "system.details.level.value", newLevel);
  if (newXP !== currentXP)
    foundry.utils.setProperty(update, "system.details.xp.value", newXP);

  if (Object.keys(update).length) await actor.update(update);
};

/** Robust die Mitglieder einer Party ermitteln (versch. PF2e-Versionen) */
const getPartyMembers = (party) => {
  let members = [];

  // 1) Bevorzugt: PartyPF2e#members (Set oder Array von Actoren)
  if (party?.members) {
    if (party.members instanceof Set) members = Array.from(party.members);
    else if (Array.isArray(party.members)) members = party.members;
  }

  // 2) Mögliche Systemspeicherung (IDs/UUIDs)
  if (members.length === 0 && Array.isArray(party?.system?.members)) {
    members = party.system.members
      .map(id => {
        try {
          // Unterstütze sowohl IDs als auch UUIDs
          if (typeof id === "string" && id.includes(".")) {
            return fromUuidSync?.(id);
          } else {
            return game.actors.get(id);
          }
        } catch { return null; }
      })
      .filter(a => a);
  }

  // 3) Fallback: Alle Charaktere, deren "parties" Set diese Party enthält
  if (members.length === 0) {
    members = game.actors.filter(a =>
      a.type === "character" &&
      (a.parties?.has?.(party) || a.parties?.some?.(p => p?.id === party.id))
    );
  }

  // Nur Spieler-Charaktere
  return members.filter(a => a?.type === "character");
};

// --- Daten vorbereiten ------------------------------------------------------
const parties = game.actors.filter(a => a.type === "party");
if (parties.length === 0) {
  ui.notifications.warn("Keine Party‑Actor gefunden. Lege zuerst einen Actor vom Typ „Party“ an und füge Mitglieder hinzu.");
  return;
}
const partyOptions = parties.map(p => `<option value="${p.id}">${foundry.utils.escapeHTML(p.name)}</option>`).join("");

// --- Dialog UI --------------------------------------------------------------
const selectXPOptions = XP_OPTIONS.map(o => `<option value="${o.key}">${o.label}</option>`).join("");

const content = `
<form class="flexcol" style="gap:.5rem;">
  <div class="form-group">
    <label>Ziel‑Party</label>
    <select name="partyId">${partyOptions}</select>
    <p class="notes">Die XP werden an alle Mitglieder dieser Party vergeben (pro Charakter).</p>
  </div>

  <div class="form-group">
    <label>Voreinstellung (pro Charakter)</label>
    <select name="preset">${selectXPOptions}</select>
    <p class="notes">Wird ignoriert, wenn unten ein eigener XP‑Wert > 0 eingetragen ist.</p>
  </div>

  <div class="form-group">
    <label>Eigener XP‑Wert (pro Charakter)</label>
    <input type="number" name="custom" value="" min="-100000" step="1" placeholder="z. B. 45"/>
    <p class="notes">Leer lassen oder 0 eintragen, um die Voreinstellung zu verwenden.</p>
  </div>
</form>
`;

const result = await Dialog.prompt({
  title: "XP vergeben an Party (PF2e)",
  content,
  label: "XP vergeben",
  callback: (html) => {
    const partyId = html.find('select[name="partyId"]').val();
    const presetKey = html.find('select[name="preset"]').val();
    const custom = Number(html.find('input[name="custom"]').val());
    return { partyId, presetKey, custom };
  },
  rejectClose: false
});

if (!result) return; // Abgebrochen

const { partyId, presetKey, custom } = result;
const party = game.actors.get(partyId);
if (!party) return ui.notifications.error("Ausgewählte Party nicht gefunden.");

const members = getPartyMembers(party);
if (members.length === 0) return ui.notifications.warn(`Die Party "${party.name}" hat keine Mitglieder (Charaktere).`);

const preset = XP_OPTIONS.find(o => o.key === presetKey) ?? XP_OPTIONS[0];
const perCharXP = Number.isFinite(custom) && custom > 0 ? Math.trunc(custom) : preset.value;

if (!Number.isFinite(perCharXP)) return ui.notifications.warn("Ungültiger XP‑Wert.");
if (perCharXP === 0) return ui.notifications.info("0 XP vergeben – keine Änderungen.");

// --- Anwenden ---------------------------------------------------------------
const updates = [];
for (const a of members) {
  await applyXPPerCharacter(a, perCharXP);
  updates.push({ name: a.name, xp: perCharXP });
}

// --- Chat-Output ------------------------------------------------------------
const list = updates.map(u => `<li><strong>${foundry.utils.escapeHTML(u.name)}</strong>: ${u.xp > 0 ? "+" : ""}${u.xp} XP</li>`).join("");

const sourceLabel = (Number.isFinite(custom) && custom > 0)
  ? `Eigener Wert: <strong>${perCharXP} XP</strong>`
  : `Voreinstellung: <strong>${foundry.utils.escapeHTML(preset.label)}</strong>`;

const msg = `
<div class="pf2e chat-card">
  <header class="card-header flexrow">
    <h3>XP-Vergabe an Party: ${foundry.utils.escapeHTML(party.name)}</h3>
  </header>
  <div class="card-content">
    <p>${sourceLabel}</p>
    <p>Mitglieder: ${members.length}</p>
    <ul>${list}</ul>
    <p class="notes">Level-Ups durch 1000‑XP‑Schritte werden automatisch am Charakterlevel verbucht. Klassenfeatures bitte wie gewohnt am Bogen pflegen.</p>
  </div>
</div>
`;
ChatMessage.create({ content: msg, speaker: { alias: "Spielleitung" } });

ui.notifications.info(`XP vergeben: ${perCharXP} pro Charakter an Party "${party.name}" (${members.length} Mitglieder)`);
