/**
 * PF2e automatic XP awarding after an encounter.
 * Prompts the GM to distribute calculated encounter XP to party actors.
 */

const applyXP = async (actor, deltaXP) => {
  if (!deltaXP) return;

  const currentXP = actor.system?.details?.xp?.value ?? 0;
  const currentLevel = actor.system?.details?.level?.value ?? 1;

  let newXP = currentXP + deltaXP;
  let newLevel = currentLevel;

  if (newXP >= 1000) {
    newLevel += Math.floor(newXP / 1000);
    newXP = newXP % 1000;
  }
  if (newXP < 0) newXP = 0;

  const update = {};
  if (newLevel !== currentLevel) foundry.utils.setProperty(update, "system.details.level.value", newLevel);
  if (newXP !== currentXP) foundry.utils.setProperty(update, "system.details.xp.value", newXP);

  if (Object.keys(update).length) await actor.update(update);
};

Hooks.on("deleteCombat", async (combat) => {
  if (!game.ready || !game.user?.isGM) return;

  const award = combat.metrics?.award;
  const baseXP = award?.xp ?? 0;
  const recipients = award?.recipients?.filter(a => a?.type === "character") ?? [];

  if (!baseXP || recipients.length === 0) return;

  const defaultXP = baseXP;

  const xp = await new Promise(resolve => {
    new Dialog({
      title: game.i18n.localize("PF2E.Encounter.AwardXP"),
      content: `<p>${game.i18n.format("Award XP for this encounter?", { xp: defaultXP, count: recipients.length })}</p>` +
        `<div class="form-group"><label>XP: <input type="number" name="xp" value="${defaultXP}"/></label></div>`,
      buttons: {
        yes: {
          label: game.i18n.localize("Yes"),
          callback: html => {
            const input = html.find('input[name="xp"]')[0];
            resolve(Number(input?.value) || defaultXP);
          }
        },
        no: {
          label: game.i18n.localize("No"),
          callback: () => resolve(null)
        }
      },
      default: "yes",
      close: () => resolve(null)
    }).render(true);
  });
  if (xp === null) return;

  for (const actor of recipients) {
    await applyXP(actor, xp);
  }

  ui.notifications.info(game.i18n.format("PF2E.Encounter.XPAwarded", { xp, count: recipients.length }));
});
