# Fretboard Arcade: Game Design Document (GDD)

**Genre:** Rhythm / Ear-Training / Arcade Practice  
**Platform:** Mobile (iOS / Android)  
**Target Audience:** Intermediate to advanced guitarists, improvisers, and musicians.  
**Design Philosophy:** No basic beginner open chords. Focus exclusively on fluid fretboard navigation, physical touch mechanics (raking, bending), real-time ear training, and voice-leading economy.

---

## 1. System Overview & Arcade Meta-Loop

The game is structured as an arcade suite with three distinct, self-contained game modes and a global arcade progression system:

```
                      +-----------------------------+
                      |       MAIN MENU / HUB       |
                      +-----------------------------+
                                     |
         +---------------------------+---------------------------+
         |                           |                           |
         v                           v                           v
+------------------+       +-------------------+       +------------------+
|   MODE 1: BEND   |       |  MODE 2: TRIADS   |       |   MODE 3: NOTE   |
|   PITCH MASTER   |       |  VOICE LEADING    |       |   ELIMINATION    |
+------------------+       +-------------------+       +------------------+
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |   ARCADE SCORING & RANKS    |
                      | (Time, Cents, Displacement) |
                      +-----------------------------+
                                     |
                                     v
                      +-----------------------------+
                      |   LOCAL & GLOBAL LEADERBOARDS|
                      |   (3-Letter Initials: "JMI") |
                      +-----------------------------+
```

---

## 2. Mode 1: Bend-by-Ear (Pitch Master)

### 2.1 Concept
An ear-training tool disguised as a tactile pitch-matching mechanic. Players push a virtual string upward and rely solely on their auditory feedback to hit target pitches without visual tuning indicators.

### 2.2 Gameplay Flow & Prompts
1. **The Challenge Prompt:** The screen presents:
   * **Starting Note & Location:** e.g., $D$ (Fret 7, G-string).
   * **Bend Type:** Half Step ($1/2$), Whole Step ($1$), Step-and-a-Half ($1\frac{1}{2}$), or Double Step ($2$).
   * **Target Pitch:** e.g., $E$ (Whole step bend from $D$).
2. **Audio Cue:** The game plays a brief chime or reference guitar stab of the target pitch.
3. **The Touch Action:**
   * A circular puck node rests on the indicated fret wire.
   * The player touches and holds the node, then drags upward (pushing toward the low strings) or downward (if bending the low E/A strings).
   * As the finger moves, the audio pitch bends smoothly in continuous microtonal steps.
4. **The Release:**
   * Releasing the finger locks in the pitch.
   * Instant feedback reveals the target cents line, the player's release point, and the exact pitch error in cents ($\pm \text{cents}$).

### 2.3 Bend Prompt Types & Difficulty Tiers
| Tier | Bend Interval | Semitones | Rarity | Typical Musical Context |
| :--- | :--- | :--- | :--- | :--- |
| **Standard** | Half Step ($1/2$) | $+1$ semitone ($100$ cents) | Common | Blues curl, leading tone to tonic |
| **Standard** | Full Step ($1$) | $+2$ semitones ($200$ cents) | Very Common | Classic rock / blues pentatonic box |
| **Advanced** | Minor 3rd ($1\frac{1}{2}$) | $+3$ semitones ($300$ cents) | Uncommon | David Gilmour / Albert King overbends |
| **Virtuoso** | Major 3rd ($2$) | $+4$ semitones ($400$ cents) | Rare | High tension climax bends on high strings |

### 2.4 Scoring Algorithm
The score for each bend round is based entirely on pitch accuracy ($\Delta \text{cents}$):

$$\Delta \text{cents} = \left| 1200 \times \log_2\left(\frac{f_{\text{player}}}{f_{\text{target}}}\right) \right|$$

* **Bullseye ($\pm 0 - 5$ cents):** $1,000\text{ pts} \times \text{Streak Multiplier}$ + Pro vibrato audio bloom.
* **In Tune ($\pm 6 - 15$ cents):** $750\text{ pts} \times \text{Streak Multiplier}$.
* **Acceptable ($\pm 16 - 30$ cents):** $350\text{ pts}$.
* **Off Pitch ($> 30$ cents):** $0\text{ pts}$, combo drops to $1\times$.

---

## 3. Mode 2: Triad Voice-Leading Engine

### 3.1 Concept
Teaches close-voiced triads across adjacent 3-string sets (Strings 1–3, 2–4, 3–5) through chord progressions and voice-leading efficiency rather than isolated shapes.

### 3.2 Core Mechanic: "Tap & Rake"
1. **The Progression Prompt:** The screen prompts a chord sequence (e.g., $\text{ii} \rightarrow \text{V} \rightarrow \text{I}$ in C major: $\text{Dm} \rightarrow \text{G} \rightarrow \text{C}$).
2. **Shape Entry:** The player taps 3 frets across any valid adjacent 3-string set to form the chord (Root, 1st Inversion, or 2nd Inversion).
3. **The Rake Gesture:** To submit, the player swipes their thumb across the three selected strings.
   * Low-latency guitar audio plays each note sequentially as the finger passes over the string.
   * If correct, the full chord sustains. If incorrect, a muted fret thud or dissonant buzz sounds.
4. **Next Chord in Sequence:** The game prompts the next chord immediately.

### 3.3 Displacement Scoring & Voice-Leading Multiplier
To discourage jumping wildly across the neck, points scale on **timing speed** combined with **fret displacement**:

$$\bar{D} = \frac{\sum_{i=1}^{3} |\text{Fret}_{i,\text{current}} - \text{Fret}_{i,\text{previous}}|}{3}$$

$$\text{Points} = \left(\text{Base Time Points} \times \max\left(0, 1 - \frac{\text{Time Elapsed}}{\text{Time Limit}}\right)\right) + \text{Displacement Bonus}$$

* **Smooth Voice Leading ($\bar{D} \le 2$ frets):** Maximum $+500\text{ bonus pts}$ + "Smooth Voice Leading" banner.
* **Moderate Shift ($2 < \bar{D} \le 4$ frets):** $+200\text{ bonus pts}$.
* **Neck Leap ($\bar{D} > 4$ frets):** $+0\text{ displacement bonus}$.

### 3.4 Sub-Mode: "Fretboard Triad Grid Clear"
* **Objective:** Clear the entire neck of a specific triad family.
* **Mechanic:** The prompt specifies a chord (e.g., **A Major**). The player must find every possible close-voiced inversion across strings 1–3, 2–4, 3–5, and 4–6.
* **Elimination:** As an inversion is successfully raked, those three frets permanently grey out on the fretboard. The player races the clock until all instances across the 22 frets are extinguished.

---

## 4. Mode 3: Note Identification & "Fret Sweeper" Elimination

### 4.1 Concept
Eliminates mental hesitation when identifying single notes, octaves, and intervals under arcade time pressure.

### 4.2 Standard Mode: Speed Hunter
* **Prompt:** A note name sounds and displays (e.g., **C#**), or a blind audio pitch plays with a target string prompt (*"Find this pitch on the D-string"*).
* **Action:** The player taps the matching fret.
* **Scoring:** Purely time-attack. Fast taps ($< 0.5\text{s}$) award $500\text{ pts}$; points degrade linearly down to $0$ at the $2.0\text{s}$ expiration limit.

### 4.3 Elimination Mode: "Fret Sweeper" (Full Board Clear)
* **Objective:** Clear all 132 fret locations (6 strings $\times$ 22 frets) by process of elimination.
* **The Loop:**
  1. The game announces a target note (e.g., **F**).
  2. The player must tap every instance of **F** across all 6 strings.
  3. Correctly tapped frets grey out, turn dark slate, and become inactive.
  4. Mis-taps trigger a 3-second penalty clock freeze.
  5. Once all instances of that note are cleared, the game immediately calls out the next note (e.g., **B**).
* **Game Over / Win State:** The round ends when the entire fretboard is completely greyed out. The final leaderboard score is determined by **Total Clear Time** and **Mistake Penalties**.

---

## 5. Arcade Scoring & High Score System

### 5.1 Score Architecture by Mode

| Game Mode | Primary Metric | Secondary Metric | Combo Driver |
| :--- | :--- | :--- | :--- |
| **Bend-by-Ear** | Pitch Delta ($\Delta \text{cents}$) | Reaction/Release Time | Consecutive bends within $\pm 10$ cents |
| **Triad Progression** | Decision Speed ($\text{ms}$) | Voice Leading ($\bar{D} \le 2$) | Unbroken progression string without wrong notes |
| **Fret Sweeper** | Total Board Clear Time | Zero Wrong Taps | Fast sequential string clears |

### 5.2 Arcade High Scores Table
* **Classic Initials Entry:** Players who place in the top 10 enter a 3-letter signature (e.g., ` Hendrix -> HEN `, ` Gilmour -> D_G `).
* **Session Breakdown:** The game over screen shows a performance card with:
  * Overall Rank: **S** (Master), **A** (Session Pro), **B** (Gigging Musician), **C** (Garage Band).
  * Pitch Accuracy Radar: Average bend deviation in cents.
  * Voice-Leading Efficiency: Average fret displacement score.
  * Speed Rating: Average reaction time per prompt.

---

## 6. Touch UX & Screen Layout Specifications

### 6.1 Viewport Ergonomics (Landscape Primary)
A phone screen cannot comfortably display all 22 frets horizontally while retaining accurate touch targets for bending and chord taps.

```
+-----------------------------------------------------------------------+
| SCORE: 48,250   COMBO: x4    [PROMPT: BEND 1-STEP FROM D (7) TO E]   |
+-----------------------------------------------------------------------+
| STRING                                                                |
| 1 (E)  ---||-------|-------|-------|-------|-------|-------|-------|--|
| 2 (B)  ---||-------|-------|-------|-------|-------|-------|-------|--|
| 3 (G)  ---||-------|-------|---(O)-|-------|-------|-------|-------|--|
| 4 (D)  ---||-------|-------|-------|-------|-------|-------|-------|--|
| 5 (A)  ---||-------|-------|-------|-------|-------|-------|-------|--|
| 6 (E)  ---||-------|-------|-------|-------|-------|-------|-------|--|
| FRET:      |   5   |   6   |   7   |   8   |   9   |  10   |  11   |  |
+-----------------------------------------------------------------------+
| [ < Shift Lower ]                                   [ Shift Higher > ]|
+-----------------------------------------------------------------------+
```

* **Dynamic 7-Fret Window:** The default view spans 7 frets. The camera smoothly pans left/right when prompts move up or down the neck.
* **Vertical Spacing:** Strings are spaced at a minimum of $52\text{px}$ touch height to prevent cross-string touch registration during bends.
* **Bend Gesture Physics:** Dragging the circle upward across string boundaries does not trigger adjacent strings; the touch is captured exclusively by the active node until finger release.