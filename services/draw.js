const Participant = require('../models/participant');
const Exclusion = require('../models/exclusion');
const Assignment = require('../models/assignment');

/**
 * Secret Santa Draw Service
 * Generates a valid assignment using a Hamiltonian cycle approach
 */
const DrawService = {
  /**
   * Perform the Secret Santa draw for a specific organizer
   * @param {number} organizerId - The organizer's ID
   * @returns {Object} { success: boolean, message: string, assignments?: array }
   */
  performDraw(organizerId) {
    const participants = Participant.findAllByOrganizer(organizerId);

    if (participants.length < 2) {
      return {
        success: false,
        message: 'Il faut au moins 2 participants pour effectuer un tirage.'
      };
    }

    const exclusionMap = Exclusion.getExclusionMapByOrganizer(organizerId);

    // Try to generate a valid assignment
    const result = this.generateHamiltonianCycle(participants, exclusionMap);

    if (!result.success) {
      return {
        success: false,
        message: 'Impossible de generer un tirage valide avec les regles d\'exclusion actuelles. ' +
                 'Il y a peut-etre trop d\'exclusions.'
      };
    }

    // Clear previous assignments for this organizer and save new ones
    Assignment.clearAllByOrganizer(organizerId);
    Assignment.createMany(result.assignments);

    return {
      success: true,
      message: `Tirage effectue avec succes pour ${participants.length} participants.`,
      count: participants.length
    };
  },

  /**
   * Generate a Hamiltonian cycle respecting exclusions
   * Each person gives to exactly one person and receives from exactly one person
   */
  generateHamiltonianCycle(participants, exclusionMap) {
    const n = participants.length;
    const ids = participants.map(p => p.id);

    // Build adjacency list (who can give to whom)
    const canGiveTo = new Map();
    for (const giver of ids) {
      const excluded = exclusionMap.get(giver) || [];
      const possible = ids.filter(r => r !== giver && !excluded.includes(r));
      canGiveTo.set(giver, possible);
    }

    // Try multiple times with random shuffling
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = this.tryBuildCycle(ids, canGiveTo);
      if (result) {
        return { success: true, assignments: result };
      }
    }

    return { success: false };
  },

  /**
   * Try to build a valid cycle using backtracking
   */
  tryBuildCycle(ids, canGiveTo) {
    const n = ids.length;

    // Shuffle IDs to randomize the cycle
    const shuffled = [...ids].sort(() => Math.random() - 0.5);

    // Try to build a cycle: first -> second -> ... -> last -> first
    const cycle = [shuffled[0]];
    const used = new Set([shuffled[0]]);

    const backtrack = () => {
      if (cycle.length === n) {
        // Check if last can give to first to complete the cycle
        const last = cycle[n - 1];
        const first = cycle[0];
        const possibleReceivers = canGiveTo.get(last) || [];
        return possibleReceivers.includes(first);
      }

      const current = cycle[cycle.length - 1];
      const possibleReceivers = canGiveTo.get(current) || [];

      // Shuffle possible receivers for randomness
      const shuffledReceivers = [...possibleReceivers].sort(() => Math.random() - 0.5);

      for (const receiver of shuffledReceivers) {
        if (!used.has(receiver)) {
          cycle.push(receiver);
          used.add(receiver);

          if (backtrack()) {
            return true;
          }

          cycle.pop();
          used.delete(receiver);
        }
      }

      return false;
    };

    if (backtrack()) {
      // Convert cycle to assignments
      const assignments = [];
      for (let i = 0; i < n; i++) {
        assignments.push({
          giverId: cycle[i],
          receiverId: cycle[(i + 1) % n]
        });
      }
      return assignments;
    }

    return null;
  },

  /**
   * Check if a valid draw is possible for a specific organizer
   * @param {number} organizerId - The organizer's ID
   */
  canPerformDraw(organizerId) {
    const participants = Participant.findAllByOrganizer(organizerId);

    if (participants.length < 2) {
      return { possible: false, reason: 'Pas assez de participants' };
    }

    const exclusionMap = Exclusion.getExclusionMapByOrganizer(organizerId);

    // Quick check: each participant must have at least one possible receiver
    for (const p of participants) {
      const excluded = exclusionMap.get(p.id) || [];
      const possibleCount = participants.length - 1 - excluded.length;
      if (possibleCount < 1) {
        return {
          possible: false,
          reason: `${p.first_name} ${p.last_name} n'a aucun receveur possible`
        };
      }
    }

    return { possible: true };
  }
};

module.exports = DrawService;
