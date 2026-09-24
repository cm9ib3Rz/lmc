# OCR A-Level Assembly (LMC) — Reference

Reference material for teaching OCR H446 assembly language, and a behaviour spec for the `lmc` simulator.
Everything marked **verified** was run through a reference interpreter (see `programs/tests.json`), not written from memory.

---

## 1. What "OCR assembly" actually is

OCR does **not** use an ARM/x86-style assembly language. The OCR A-Level (H446) assembly language is the **Little Man Computer (LMC)**: 11 mnemonics, one accumulator, 100 mailboxes.

- Spec coverage (H446): Component 01, section **1.2.4** (*Types of programming language*). **1.2.4(c)** is assembly language, including following and writing simple programs with the LMC instruction set, which the spec gives in **Appendix 5d**. **1.2.4(d)** is the modes of addressing memory. This comes from OCR's own *Subject Content Clarification Guide* (read directly; see §7.1). An earlier draft of this document cited "1.2.3b / 1.2.4c" from a third-party site; that was slightly off.
- **AQA is different.** AQA uses an ARM-like set (`LDR`, `STR`, `MOV`, `CMP`, `BEQ`, `AND`, `LSL`…). Many revision sites mix the two — warn students, and check any resource is tagged OCR.
- The clarification guide says candidates "need to be familiar with the instructions given in Appendix 5d" and should be able to read, write, trace and amend LMC programs. **Appendix 5d has now been read directly** (specification v3.0, "Little Man Computer Instruction Set"; see §3): it lists mnemonics and short names only, with **no numeric opcodes and no register-transfer wording**, and says "in questions mnemonics will always be given according to the left hand column". **Still not verified:** whether each exam paper reprints that table. The sample paper's LMC question (Q5) shows only a program listing.
- The spec expects the **four addressing modes** (immediate, direct, indirect, indexed), and OCR says they should be **integrated with assembly language**: candidates should have experience of using them when writing, reading and tracing programs. The LMC itself only implements **direct** addressing — see §7 and §7.1 for what OCR actually says.

## 2. The machine model

| Part | Detail |
|---|---|
| Memory | 100 **mailboxes**, addresses `00`–`99`, each holding one 3-digit number `000`–`999` |
| Word | Instructions and data are the *same kind of thing* — a 3-digit number (stored-program concept) |
| ACC | Accumulator — the only general register. All arithmetic goes through it |
| PC | Program Counter — address of the next instruction. Starts at `00` |
| MAR / MDR | Memory Address / Data Register (used in the fetch–decode–execute cycle) |
| CIR | Current Instruction Register — holds the instruction being decoded |
| Input / Output | INBOX and OUTBOX, one number at a time |
| Machine code | `opcode` = hundreds digit, `operand` = last two digits (a mailbox address) |

## 3. Instruction set

| Mnemonic | Opcode | Operand | Meaning (close paraphrase; OCR's own wording is in the table below) | Register-transfer effect |
|---|---|---|---|---|
| `ADD` | `1xx` | address | Add the contents of the mailbox to the accumulator | `ACC ← ACC + [xx]` |
| `SUB` | `2xx` | address | Subtract the contents of the mailbox from the accumulator | `ACC ← ACC − [xx]` |
| `STA` | `3xx` | address | Store the accumulator in the mailbox | `[xx] ← ACC` |
| *(unused)* | `4xx` | — | Not an instruction — treat as illegal (the invented LMC-X in §7.1 uses opcode 4 for `LDX`) | — |
| `LDA` | `5xx` | address | Load the mailbox contents into the accumulator | `ACC ← [xx]` |
| `BRA` | `6xx` | address | Branch always | `PC ← xx` |
| `BRZ` | `7xx` | address | Branch if the accumulator is zero | `if ACC = 0 then PC ← xx` |
| `BRP` | `8xx` | address | Branch if the accumulator is zero **or positive** | `if ACC ≥ 0 then PC ← xx` |
| `INP` | `901` | none | Input a number into the accumulator | `ACC ← input` |
| `OUT` | `902` | none | Output the accumulator | `output ← ACC` |
| `HLT` | `000` | none | End the program (`COB` is a common alias) | stop |
| `DAT` | — | optional value | *Pseudo-instruction*: reserve a mailbox, give it a label, optionally initialise it | assembler only, no opcode |

**OCR's own table** (specification Appendix 5d, read directly). It is the only official statement of the instruction set I found, and it does not contain opcodes (`1xx`, `5xx` …), operand formats or register transfers. Those columns above are the standard LMC convention, not OCR wording.

| Mnemonic | OCR's name | Alternative mnemonics OCR accepts in answers |
|---|---|---|
| `ADD` | Add | |
| `SUB` | Subtract | |
| `STA` | Store | `STO` |
| `LDA` | Load | `LOAD` |
| `BRA` | Branch always | `BR` |
| `BRZ` | Branch if zero | `BZ` |
| `BRP` | Branch if positive | `BP` |
| `INP` | Input | `IN`, `INPUT` |
| `OUT` | Output | |
| `HLT` | End program | `COB`, `END` |
| `DAT` | Data location | |

OCR's table says "positive", but its **Autumn 2021 mark scheme (Q6 a ii)** describes the test as the accumulator being "positive **or zero**", which is why `BRP` here branches when ACC ≥ 0.

Key points students miss:

- `LDA`/`STA`/`ADD`/`SUB` all mean **mailbox contents**, never the number itself. `LDA 10` loads *what is stored in mailbox 10*, it does not load the value 10.
- `ADD`/`SUB` need the value to be in a mailbox first. To add a constant, `DAT` it: `one DAT 1` … `ADD one`.
- `OUT`, `INP`, `HLT` take no operand.
- `SUB` can take ACC negative. `BRP` is the "not negative" test; there is no "branch if negative" — you branch on the *opposite* condition, or fall through.
- There is no compare instruction, no multiply/divide, no AND/OR, no shifts. Everything is built from these 11.

## 4. Assembly language syntax

```
[label]   MNEMONIC   [operand]      // comment
```

- One instruction per line. Labels are optional and start at the left margin.
- Operand is a **label** or a **numeric mailbox address**. Labels are the norm.
- `DAT` reserves a mailbox: `count DAT` (starts at 0) or `one DAT 1` (starts at 1). Unlabelled `DAT` lines are allowed (used for arrays).
- Instructions are placed in consecutive mailboxes starting from `00`, in source order. `DAT` lines take a mailbox too, in source order.
- **Put `DAT` lines after `HLT`.** If execution runs into a `DAT` it executes the number as an instruction; `DAT 0` is `000` = `HLT`.
- Comments: `//` (used by the widely-used Higginson simulator). Not part of the OCR exam language.

### Two-pass assembly (a good demo for the simulator)

1. **Pass 1 — symbol table.** Walk the lines, count the address, record each label's address.
2. **Pass 2 — generate code.** Replace mnemonics with opcodes and labels with addresses.

Example — `programs/countdown.lmc` (**verified**):

| Addr | Source | Machine code |
|---|---|---|
| 00 | `INP` | 901 |
| 01 | `loop BRZ end` | 705 |
| 02 | `OUT` | 902 |
| 03 | `SUB one` | 206 |
| 04 | `BRA loop` | 601 |
| 05 | `end HLT` | 000 |
| 06 | `one DAT 1` | 001 |

Symbol table: `loop = 01`, `end = 05`, `one = 06`.

### Why labels?

A label to the **left** of an instruction or `DAT` names that mailbox; a label to the **right** of a mnemonic stands for that mailbox's address; with `DAT` a label is a **variable** (`one DAT 1`). Without labels the programmer counts every address by hand, and inserting one instruction moves every later mailbox, so every instruction that refers to one would need editing. The assembler recomputes them on each assembly. (In the two-pass example above, inserting an instruction before `end HLT` turns `BRZ end` from `705` into `706` and moves `one` to 07. The simulator's reference drawer says this too.)

## 5. Fetch–decode–execute in the LMC

**Fetch** (identical for every instruction):

```
MAR ← PC
MDR ← [MAR]
CIR ← MDR
PC  ← PC + 1
```

**Decode:** the control unit splits `CIR` into opcode (hundreds digit) and operand (last two digits).

**Execute** (by opcode):

| Instruction | Execute steps |
|---|---|
| `LDA xx` | `MAR ← xx` ; `MDR ← [MAR]` ; `ACC ← MDR` |
| `STA xx` | `MAR ← xx` ; `MDR ← ACC` ; `[MAR] ← MDR` |
| `ADD xx` | `MAR ← xx` ; `MDR ← [MAR]` ; `ACC ← ACC + MDR` |
| `SUB xx` | `MAR ← xx` ; `MDR ← [MAR]` ; `ACC ← ACC − MDR` |
| `BRA xx` | `PC ← xx` |
| `BRZ xx` | `if ACC = 0 then PC ← xx` |
| `BRP xx` | `if ACC ≥ 0 then PC ← xx` |
| `INP` | `ACC ← input` |
| `OUT` | `output ← ACC` |
| `HLT` | stop the clock |

A branch works by **overwriting the PC after it has already been incremented** — that is why the fetch increments *before* execute.

**Checked against OCR's own register material** (spec 1.1.1(a)-(b); Clarification Guide; 1.1.1 Delivery Guide; sample paper Q5(e); June 2022 mark scheme):

- **Registers OCR names:** PC, ACC, MAR, MDR, CIR. The delivery guide calls the MDR the *Memory Buffer Register (MBR)*, and the June 2022 mark scheme says "Allow Memory Buffer Register for MDR".
- **PC copied to the MAR first:** the sample paper's Q5(e)(ii) ("which register would the contents of the PC be copied to?") is answered "MAR", and the June 2022 mark scheme says the PC's contents are "copied to the MAR at start of FDE" and "incremented (by one) on every cycle".
- **Where the increment goes is *not* fixed by OCR's marking, but the sources agree on "after the instruction is fetched".** OCR's 2015 delivery guide (Learner Resource 2) lists the fetch as PC → MAR; `[MAR]` → MBR; MBR → CIR; **then** "the PC is incremented". Wikipedia's account of the cycle has the same order (check the PC, fetch the instruction, increment the PC). **That is the simulator's default** (decision 2026-09-19; it used to be the other way round). Some textbooks increment straight after `MAR ← PC`; the URL parameter `?pc=before` (default `?pc=after`; `early`/`late` also work; there is no on-screen control) switches to that order. Both orders start with `MAR ← PC` and increment once per cycle. Programs behave identically either way (tested).
- **ALU and control unit (1.1.1a):** the specification names both. The ALU does the arithmetic (`ADD`, `SUB`) and the result goes into the ACC; the control unit decodes the CIR and sends the control signals (for example the read/write signal on the control bus). The simulator says so in the `decode` and `ACC ← ACC ± MDR` step text, in "The machine" tab, and in its CPU diagram.
- **Interrupts (delivery guide, last execute bullet):** "the processor checks for interrupts ... and either branches to the relevant interrupt service routine or starts the cycle again". The LMC has none, so the simulator has no such step; the reference notes it under "After execute". Interrupts return in 1.2.1.
- **Architecture (1.1.1c–f) and the delivery guide's remark that the LMC models a simple von Neumann machine:** "The machine" tab now names von Neumann and Harvard and says what the LMC leaves out (clock speed, cores, cache, pipelining).
- **Execute:** the delivery guide says "the address part of the instruction is placed in the MAR". That is the `MAR ← xx` step (the simulator words it "the address part of the CIR"). Branches take the address straight into the PC.
- **ACC:** the June 2022 mark scheme gives its purposes as holding all input/output, holding results of calculations (from the ALU), being checked for conditional branching (e.g. BRZ), and storing data which has come from the MDR/RAM. That matches `INP`/`OUT` using the ACC only, and `LDA` going memory → MDR → ACC.
- **Buses:** spec 1.1.1(a) adds the data, address and control buses ("how this relates to assembly language programs"), and the Clarification Guide says candidates must understand "how and where data and addresses are transmitted to/from in each part of this cycle". The simulator shows, on every step that reads or writes memory, what is on the address bus (the MAR's address), the data bus (the value, and its direction between memory and the MDR) and the control bus (memory read or write).

## 6. Worked examples

### 6.1 Add two numbers — `programs/add.lmc` (**verified**, inputs 5 and 3)

```
        INP
        STA first
        INP
        ADD first
        OUT
        HLT
first   DAT
```

| Step | PC (at fetch) | CIR | Instruction | ACC after | Mailbox change | Output |
|---|---|---|---|---|---|---|
| 1 | 00 | 901 | `INP` | 5 | — | — |
| 2 | 01 | 306 | `STA first` | 5 | `[06] = 5` | — |
| 3 | 02 | 901 | `INP` | 3 | — | — |
| 4 | 03 | 106 | `ADD first` | 8 | — | — |
| 5 | 04 | 902 | `OUT` | 8 | — | **8** |
| 6 | 05 | 000 | `HLT` | 8 | — | — |

### 6.2 Countdown — `programs/countdown.lmc` (**verified**, input 3)

| Step | PC | CIR | Instruction | ACC after | Output |
|---|---|---|---|---|---|
| 1 | 00 | 901 | `INP` | 3 | |
| 2 | 01 | 705 | `BRZ end` (ACC≠0, no branch) | 3 | |
| 3 | 02 | 902 | `OUT` | 3 | **3** |
| 4 | 03 | 206 | `SUB one` | 2 | |
| 5 | 04 | 601 | `BRA loop` → PC=01 | 2 | |
| 6 | 01 | 705 | `BRZ end` | 2 | |
| 7 | 02 | 902 | `OUT` | 2 | **2** |
| 8 | 03 | 206 | `SUB one` | 1 | |
| 9 | 04 | 601 | `BRA loop` | 1 | |
| 10 | 01 | 705 | `BRZ end` | 1 | |
| 11 | 02 | 902 | `OUT` | 1 | **1** |
| 12 | 03 | 206 | `SUB one` | 0 | |
| 13 | 04 | 601 | `BRA loop` | 0 | |
| 14 | 01 | 705 | `BRZ end` (ACC=0, branch) → PC=05 | 0 | |
| 15 | 05 | 000 | `HLT` | 0 | |

### 6.3 The example library

All in `programs/`, with expected results in `programs/tests.json` (36 cases, all pass).

| File | Demonstrates | Concept |
|---|---|---|
| `add.lmc` | INP / STA / ADD / OUT | sequence, variables |
| `max.lmc` | SUB then BRP | selection (if/else) |
| `countdown.lmc` | BRZ + BRA | iteration (while loop) |
| `multiply.lmc` | repeated addition | counted loop, accumulator variable |
| `square.lmc` | repeated addition inside a sentinel loop | reads numbers and outputs each square until 0; the total must be reset every time round |
| `sum-until-zero.lmc` | sentinel input | indefinite iteration |
| `max10.lmc` | loop, `SUB` then `BRP` | running maximum of ten inputs |
| `min10.lmc` | loop, `SUB` then `BRP` | running minimum of ten inputs |
| `divide.lmc` | repeated subtraction | quotient **and** remainder (`DIV`/`MOD`) |
| `sieve.lmc` | self-modifying code (**my own illustration, not from OCR; optional**) | Sieve of Eratosthenes: primes up to 50, using a row of flags reached by rewriting its own `LDA`/`STA` instructions. Flags start at mailbox 42, so 57 is the largest limit that fits |
| `array-sum-indexed.lmc` | self-modifying code (**my own illustration, not from OCR; optional**) | one way to imitate indexed addressing in plain LMC |
| `x/*.lmc` (17 programs) | **LMC-X only — not OCR** | immediate / indirect / indexed modes, see §7.1 |

## 7. Addressing modes (spec concept — only *direct* exists in the LMC)

An **addressing mode** says how the operand of an instruction is interpreted. OCR itself defines the modes in exactly these terms (see §7.1). The notation below is a **teaching convention, not OCR's** (only `#` for immediate has any OCR precedent), with `[5] = 12`, `[12] = 99`, `[7] = 40` and index register `IX = 2`:

| Mode | Notation | Operand is… | Result loaded |
|---|---|---|---|
| Immediate | `LDA #5` | the data itself | 5 |
| Direct | `LDA 5` | the address of the data | `[5]` = **12** |
| Indirect | `LDA (5)` | the address of *the address* of the data | `[[5]]` = `[12]` = **99** |
| Indexed | `LDA 5,IX` | a base address; effective address = base + IX | `[5+2]` = `[7]` = **40** |

- **LMC = direct only.** `LDA 5` is always "contents of mailbox 5".
- Indirect and indexed are used for pointers, arrays, and tables (the operand is a base; the register moves through the structure).
- **Imitating indexed access in plain LMC** is possible because instructions are numbers in memory: add 1 to the instruction word `5xx` and it becomes `5(xx+1)`. See `array-sum-indexed.lmc`. **This is my own illustration, not from OCR** (nothing I read in OCR's material mentions self-modifying code). Treat it as an optional extra, and don't present it as something the syllabus asks for.
- **How is the mode encoded?** OCR doesn't define it: I found no bit layout or mode field in any OCR document (§7.1 has the evidence and what I could and couldn't check). OCR's delivery guide describes the value in immediate mode as following the opcode in memory. Teaching material elsewhere describes the opcode part carrying mode bits, and real CPUs either use a different opcode per mode (6502) or a mode field (ARM's immediate bit, x86 ModR/M). §7.1 defines an optional, clearly-invented encoding for the simulator.

### 7.1 What OCR specifies about addressing modes, and an optional LMC-X for the simulator

#### Evidence: what OCR actually says

| Source | What it says (paraphrased) | Checked how |
|---|---|---|
| **Spec 1.2.4(c) and (d)**, as quoted in OCR's *Subject Content Clarification Guide* | (c) Assembly language, including following and writing simple programs with the LMC instruction set; the instructions are in **spec Appendix 5d**. (d) Modes of addressing memory: immediate, direct, indirect and indexed. Addressing "should be integrated with assembly language", and candidates should have **experience of using all four modes when writing, reading and tracing assembly programs**. The guide also lists Peter Higginson's LMC simulator as a resource. | PDF text extracted and read |
| **H446/01 Autumn 2021 mark scheme, Q6(d)** (12 marks) | Each mode is defined by what **"the operand"** holds: the data itself (immediate), the address of the data (direct), an address that holds the address of the data (indirect), or an address offset by **the Index Register** (indexed). Worked with "an operand of 27". Evaluation points: immediate needs no fetch but is limited by the operand's size; direct is limited in address range by the operand's size; indirect reaches more addresses but needs several fetches; indexed suits sequential data such as arrays. Q6(b)-(c) in the same paper are an LMC integer-division-and-remainder question. | PDF text extracted and read |
| **OCR Delivery Guide, 1.2.4** | Immediate addressing is so called because the value **immediately follows the operation code in memory**. Its example is `MOV A,#30h` (an 8051-style line, *not* LMC), with `#` marking the immediate value. | **Search-result snippet only** — the page would not open for me. Please check it yourself. |
| **H446/01 sample assessment paper, Q5** | LMC listings in the exam are plain LMC: upper-case mnemonics and labels (`NUMA`, `QUIT`), `DAT` lines after `HLT`, no addressing-mode syntax. Part (e) has the PC copied to the MAR. | PDF text extracted and read |
| **Not found** | Any OCR-defined bit layout, mode field, or assembly notation for indirect or indexed modes in an LMC program. | I searched the sources above, **not** the full spec PDF (too big for my tools) |

**What this means for staying inside the syllabus:**

- OCR treats the modes **conceptually**, in terms of "the operand" and "the Index Register". It doesn't define an encoding, and the exam LMC is direct-only.
- OCR's own delivery guide describes the operand as following the opcode in memory, so the operand-follows design below is consistent with OCR's description.
- The syllabus does want the modes **used in assembly programs** (writing, reading, tracing), so a simulator that supports them serves the specification rather than departing from it.
- Only `#` for immediate has any OCR precedent. The concrete opcodes and the `(x)` and `x,X` syntax below are **my invention**, so keep OCR's own terms ("operand", "Index Register") in front of students and treat this notation as a teaching convenience.
- Keep it **off by default**: standard OCR LMC must remain the default behaviour.

#### LMC-X (optional; **not OCR**)

A concrete instance of that description, for the simulator only. **Label it as invented wherever students see it; don't present it as the OCR instruction set.**

**Design rule:** like an 8-bit CPU (6502, 6809, Z80), instructions are **variable length**. The **opcode word** carries the operation *and* the addressing mode; the **operand follows in the next mailbox**.

#### Word format

Words stay 3 digits (000–999). Instructions are one or two words:

```
opcode word:   O M S          operand word (next mailbox):  a value 000-999
               | | |            - an address 00-99 for direct / indirect / indexed
               | | +-- 0, except group 9 (below)   - any value 0-999 for immediate
               | +---- addressing mode
               +------ operation (same digit as plain LMC)
```

| Mode digit `M` | Mode | Assembly syntax | Example | Words |
|---|---|---|---|---|
| `0` | Direct | `LDA 5` / `LDA name` | `LDA 5` | `500` `005` |
| `1` | Immediate | `LDA #5` | `LDA #5` | `510` `005` |
| `2` | Indirect | `LDA (5)` / `LDA (name)` | `LDA (5)` | `520` `005` |
| `3` | Indexed | `LDA 5,X` / `LDA name,X` | `LDA 5,X` | `530` `005` |

The opcode digit is the same as in the LMC (`1` ADD, `2` SUB, `3` STA, `5` LDA, `6` BRA, `7` BRZ, `8` BRP). Instructions with no operand are **one word**: `HLT` `000`, `INP` `901`, `OUT` `902` (unchanged from plain LMC), plus the two new ones below.

#### Which instructions accept which modes

| Instruction | Direct | Immediate | Indirect | Indexed | Why |
|---|---|---|---|---|---|
| `LDA` `ADD` `SUB` | ✓ | ✓ | ✓ | ✓ | read a value |
| `STA` | ✓ | ✗ | ✓ | ✓ | can't store into a constant |
| `LDX` | ✓ | ✓ | ✗ | ✗ | keep it small |
| `BRA` `BRZ` `BRP` | ✓ | ✗ | ✗ | ✗ | no indirect branches, to keep it simple |

The assembler rejects the ✗ combinations (**verified**: `STA #5`, `BRA (5)`, `BRZ 5,X`, `LDX (5)` are errors).

#### New register and instructions

Indexed mode needs an index register (OCR's term is "the Index Register"; LMC-X calls it **X**), and something to set and read it. LMC-X adds four instructions (all invented):

| Mnemonic | Words | Effect |
|---|---|---|
| `LDX` | `400` `005` / `410` `000` | `X ← [05]` (direct) / `X ← 0` (`LDX #0`). Uses opcode `4`, which plain LMC leaves unused. |
| `INX` | `903` | `X ← X + 1` |
| `TXA` | `904` | `ACC ← X` (needed to test the index against a limit) |
| `SLEEP n` | `905` `nnn` | Wait `n` milliseconds, `n` a literal 0-999 (`SLEEP 500`; a leading `#` is accepted). Two words, like the instructions with operands; the operand word goes to the OPR and the step is `wait OPR ms`. **The machine has no clock**: the execute step only reports `sleep: n` (and adds it to a virtual `sleptMs` total), and the page's run loop does the waiting. Slow / Medium / Fast wait exactly `n` ms on top of their per-step delay; the extra **Real time** speed (1 ms per step, extended mode only) makes it almost exact; **Instant** and manual stepping never wait. The status line shows "Slept … in total". |

#### Fetch–decode–execute with a following operand

The PC now advances by the **instruction length**, so a two-word instruction needs an extra fetch. Registers as before, plus an internal operand register **OPR**:

```
Fetch opcode:   MAR ← PC ; MDR ← [MAR] ; CIR ← MDR ; PC ← PC + 1
Decode:         O = hundreds digit, M = tens digit; does this opcode need an operand?
Fetch operand:  MAR ← PC ; MDR ← [MAR] ; OPR ← MDR ; PC ← PC + 1      (two-word instructions only)
Execute:        depends on the mode - see below
```

Execute step, using `LDA` as the example:

| Mode | Register transfers in *execute* | Data reads |
|---|---|---|
| Direct | `MAR ← OPR` ; `MDR ← [MAR]` ; `ACC ← MDR` | **1** |
| Immediate | `ACC ← OPR` | **0** |
| Indirect | `MAR ← OPR` ; `MDR ← [MAR]` ; `MAR ← MDR` ; `MDR ← [MAR]` ; `ACC ← MDR` | **2** |
| Indexed | `MAR ← OPR + X` ; `MDR ← [MAR]` ; `ACC ← MDR` | **1** |

Including the two instruction fetches, total memory accesses for `LDA` are **3 / 2 / 4 / 3** (direct / immediate / indirect / indexed). **Verified** by counting on the oracle. Indirect is the slowest (two trips to memory for the data) and immediate the fastest (no data access at all) — a good discussion point. For `STA` the same address calculation applies but the last step is a write: `[MAR] ← MDR`. A branch simply loads `PC ← OPR` (or conditionally does so).

#### Worked example (matches the table in §7)

Memory `[5] = 12`, `[12] = 99`, `[7] = 40`, and `X = 2`. **All values verified by running them.**

| Instruction | Words | Result in ACC | Why |
|---|---|---|---|
| `LDA #5` | `510` `005` | **5** | the operand is the value |
| `LDA 5` | `500` `005` | **12** | `[5]` |
| `LDA (5)` | `520` `005` | **99** | `[[5]] = [12]` |
| `LDA 5,X` | `530` `005` | **40** | `[5 + 2] = [7]` |

With `ACC = 9`: `STA 5` writes `[5]`; `STA (5)` writes `[12]`; `STA 5,X` writes `[7]` (**verified**).

#### Example programs (`programs/x/`, tests in `programs/x/tests-x.json`, all 35 cases pass)

| File | Mode(s) | Shows |
|---|---|---|
| `countdown-x.lmc` | immediate | `SUB #1` — no `one DAT 1` needed; compare `countdown.lmc` |
| `array-sum-x.lmc` | indexed | `LDA data,X` + `INX`; compare the self-modifying `array-sum-indexed.lmc` |
| `double-array-x.lmc` | indexed | indexed **store** as well as load/add |
| `pointer-x.lmc` | indirect + immediate | a pointer variable; read and write through it |
| `big-immediate-x.lmc` | immediate | `LDA #500` / `ADD #400` = 900 — full-range immediates (a packed encoding couldn't do this) |
| `fibonacci-x.lmc` | immediate | first 10 Fibonacci numbers; every constant is a `#` value, so no `DAT` constants |
| `reverse-x.lmc` | indexed | input 5 numbers into a row with `STA data,X`, output them backwards with `LDX i` / `LDA data,X` |
| `max10-x.lmc` | indexed | largest of ten inputs, kept in a row; compare `max10.lmc`, which never stores them |
| `linear-search-x.lmc` | indexed | search a row of 8 for an input number: its position, or 999 |
| `bubble-sort-x.lmc` | indexed | sort 6 inputs in place; `first,X` is data[X] and `second,X` is data[X+1] because `second` labels the next mailbox |
| `linked-list-x.lmc` | indirect + indexed | follow a list of two-mailbox nodes (value, address of next): `LDA (ptr)` for the value, `LDX ptr` then `LDA 1,X` for the next pointer. Node addresses are written in by hand |
| `sieve-x.lmc` | indexed + immediate | Sieve of Eratosthenes with `flag,X`: primes up to 45 (two-word instructions push the flags to mailbox 54, so 45 is the largest limit). Compare `sieve.lmc` |

Assembled listing of `array-sum-x.lmc` (**verified**). Note the addresses skip: each two-word instruction takes two mailboxes.

| Addr | Words | Source |
|---|---|---|
| 00–01 | `410` `000` | `LDX #0` |
| 02–03 | `530` `021` | `loop LDA data,X` |
| 04–05 | `100` `020` | `ADD total` |
| 06–07 | `300` `020` | `STA total` |
| 08 | `903` | `INX` |
| 09 | `904` | `TXA` |
| 10–11 | `210` `005` | `SUB #5` |
| 12–13 | `700` `016` | `BRZ done` |
| 14–15 | `600` `002` | `BRA loop` |
| 16–17 | `500` `020` | `done LDA total` |
| 18 | `902` | `OUT` |
| 19 | `000` | `HLT` |
| 20 | `000` | `total DAT 0` |
| 21–25 | `004` `007` `001` `009` `003` | `data DAT 4` … (array) |

Symbol table: `loop = 02`, `done = 16`, `total = 20`, `data = 21`. Because instruction lengths vary, **pass 1 of the assembler is essential** — you can't work out a label's address without knowing how long every earlier instruction is.

#### Design choices (packed vs. following operand)

There are two realistic ways to encode this, and it is a nice comparison for teaching:

| | **Operand packed in the opcode word** | **Operand follows** (used here) |
|---|---|---|
| Length | fixed (one word) | variable (one or two words) |
| Real examples | ARM, MIPS (small immediates, fixed 32-bit words) | 6502, 6809, Z80, x86 (operand bytes follow) |
| Immediate range | limited by the spare bits | full word |
| Fetch | one fetch | extra fetch for the operand |
| Decode / PC | simple (`PC + 1`) | PC advances by the length |

Plain LMC packs the address into the word (`5xx`); LMC-X moves it out to get room for the mode digit and full-range immediates.

#### Limitations and caveats

- **Not binary-compatible with plain LMC.** Source is a superset, so the plain-LMC programs in `programs/` assemble and run unchanged — **verified: 30 of the 32 cases in `tests.json` pass** — but the machine code is different (`LDA 5` is `500` `005`, not `505`).
- **Two plain-LMC programs do not work on LMC-X:** `array-sum-indexed.lmc` and `sieve.lmc` rewrite their own one-word instructions, so they fail on my interpreter (for `array-sum-indexed.lmc`, `illegal instruction 501`). That is only a quirk of this invented design, observed on my own oracle. It is not an OCR point and not a finding about real CPUs.
- **Programs get longer.** All 100 mailboxes still hold code and data, and every non-trivial instruction costs two. The assembler should report "program too large".
- **Branching into an operand word** executes the operand as an opcode: `BRA 1` on `600` `001` gives `illegal instruction 1` (**verified**). A good "what went wrong?" question.
- **Bad addresses:** an indirect pointer outside 0–99 is an error (**verified**), and so is an indexed address above 99 (**verified**: `LDA 99,X` with `X = 5` → `address out of range 104`). No wrap-around.
- **Immediates must be 0–999** (**verified**: `LDA #1000` is rejected).
- **`DAT` holds numbers, not labels**, so `pointer-x.lmc` hard-codes `ptr DAT 12` for a hand-fixed layout. You could let `DAT` accept a label in your assembler, but that is a further invention.
- **Exam link:** OCR's Autumn 2021 mark scheme asks candidates to discuss the modes in terms of what the operand holds and the trade-offs (fetches, range, arrays). It doesn't require any particular bit layout, so this encoding is not something to teach as examinable.

#### Peripherals (optional; extended LMC only; **not OCR**)

Behind a checkbox in the "Peripherals" panel (below fetch-decode-execute), **off by default**, the extended LMC gets three switches and three lamps, **memory-mapped** to the top six mailboxes:

| Mailbox | Name | Behaviour |
|---|---|---|
| 94, 95, 96 | `switch1`, `switch2`, `switch3` | Clicking a switch **writes 1 (up) or 0 (down)** into its mailbox; a program reads it with `LDA switch1`. |
| 97, 98, 99 | `lamp1`, `lamp2`, `lamp3` | A lamp is **lit while its mailbox holds anything other than 0**; a program lights it with `STA lamp1`. |

- **They are ordinary memory.** There is no special device code in the CPU. A switch mailbox can also be written by a program, and what is written stands (the switch simply shows "up" while its mailbox is not 0). Going Back or Reset restores these mailboxes with the rest of memory. Double-clicking a switch mailbox in the grid flips it, like clicking the switch.
- **When the checkbox is on:** the assembler **reserves** mailboxes 94-99 (a program's own code and data may use 00-93; a longer program is an error), predefines the six names (they cannot be used as labels), and the memory grid draws those six mailboxes hatched, with a double border, their names and an "I/O" tag. A running program may still read and write them; the sieve, for example, writes flags there and just lights a few lamps, which is harmless. With it off the six mailboxes are plain memory and the names do not exist.
- Choosing a peripheral sample turns the checkbox on. Programs that poll a switch (`wait LDA switch1`, `BRZ wait`) need Medium or Fast speed, not Instant, so you can click while they run.
- **Torn reads:** a program that reads several switches one after another can see a mixture if two switches change while it is halfway through. A single click changes one switch, so it cannot; `switch-value-x.lmc` says so in a comment. Real hardware polling has the same problem.
- Samples (`programs/x/`, no oracle: tested in `src/engine/peripheral-samples.test.ts`): `lamps-x.lmc` (lamps copy switches), `blink-x.lmc` (lamp1 on, `SLEEP 500`, off, `SLEEP 500`, forever; choose Real time), `switch-value-x.lmc` (three switches as a binary number, output when it changes), `binary-counter-x.lmc` (lamps count 0-7 in binary), `traffic-lights-x.lmc` (a table of stages walked with `red,X` / `amber,X` / `green,X` / `time,X`).

#### Simulator notes

- Parse operands with three patterns: `#<number>`, `(<name-or-number>)`, `<name-or-number>,X`; anything else is direct.
- The assembler needs the instruction length in pass 1 (2 for anything with an operand, 1 for `INP` `OUT` `HLT` `INX` `TXA` `DAT`).
- **Implemented** as the URL setting `?lmc=extended` (also `?lmc=x`), default **off** (the standard OCR LMC). With it off the app never mentions addressing modes: no reference tab, no mode row in the hover bubble, and the assembler's errors for `#5`, `(5)` and `5,X` just say the operand must be a label or a mailbox number. With it on there is an "Extended LMC · not OCR" badge, the X and OPR registers, an "Addressing modes" reference tab and its own examples (`programs/x/`). Tests: the plain-LMC programs pass, apart from `array-sum-indexed.lmc` (see the caveat above), and the machine code and memory-access counts match `lmcx-oracle.js` instruction by instruction.
- In the fetch–execute animation, show the operand fetch as its own step and count memory accesses per mode (3 / 2 / 4 / 3).
- A cross-check for your build: `node docs/reference-oracle/lmcx-oracle.js programs/x tests-x.json`.

## 8. Common misconceptions and errors

| Misconception / error | Fix |
|---|---|
| "`LDA 5` loads the number 5" | It loads the *contents of mailbox 5*. Use `DAT` for constants. |
| "`ADD 1` adds one" | Adds the contents of mailbox 1 — probably an instruction! |
| `DAT` placed before/inside the code | It executes as an instruction; `DAT 0` = `HLT`. Put data after `HLT`. |
| Forgetting `HLT` | CPU runs into the data area and executes it as code. |
| Forgetting `BRA loop` at the end of a loop | Falls through instead of repeating. |
| `BRZ`/`BRP` used after `OUT`/`STA` | These branch on ACC *at that moment*; `STA`/`OUT` leave ACC unchanged but be sure you know what ACC holds. |
| "There is a compare" | There isn't. Compare with `SUB` then `BRZ` (equal) / `BRP` (≥). |
| "Branching if negative" | `BRP` branches for ≥ 0; invert the logic. |
| Reusing a label or using a mnemonic as a label | Assembler error. |
| Confusing OCR LMC with AQA assembly | Different instruction sets entirely. |
| "The Little Man is the CPU's clock" | The LMC is a *model*; the fetch–decode–execute cycle is what to link it to. |

## 9. Exam-style practice (answers included)

**Q1.** Write the machine code for: `STA 25`, `LDA 10`, `BRZ 4`, `INP`, `HLT`. *(5 marks)*
> `325`, `510`, `704`, `901`, `000`.

**Q2.** Mailboxes contain: `00:505  01:106  02:902  03:000  04:000  05:012  06:030`. Trace the program and state the output. *(3 marks)*
> `LDA 5` → ACC = 12. `ADD 6` → ACC = 42. `OUT` outputs **42**. `HLT`.

**Q3.** State the output of `countdown.lmc` when the input is 0. Explain why. *(2 marks)*
> No output. `BRZ end` is taken on the first pass (ACC = 0), so `OUT` is never reached.

**Q4.** A student writes this. Explain why it never asks for an input or produces any output. *(3 marks)*
```
total   DAT 0
        INP
        ADD total
        OUT
        HLT
```
> `total` is assembled into mailbox 00 and holds `000`. Execution starts at mailbox 00, so the CPU fetches `000` = `HLT` and stops immediately, before `INP`. Data (`DAT`) must be placed after `HLT`. *(Verified: halts after 1 fetch, no output.)*

**Q5.** State the fetch stage of the cycle using register-transfer notation. *(4 marks)*
> `MAR ← PC`, `MDR ← [MAR]`, `CIR ← MDR`, `PC ← PC + 1`. (Some textbooks increment straight after `MAR ← PC`; the mark schemes checked do not fix the position, so either order should earn the marks.)

**Q6.** Explain what is meant by the stored-program concept, and give one way the LMC illustrates it. *(3 marks)*
> Instructions and data are held in the same memory as numbers, and fetched the same way. In the LMC, both instructions (`901`, `306`) and data (`DAT`) occupy mailboxes; a program can even overwrite its own instructions.

**Q7.** Give two advantages of assembly over a high-level language and one disadvantage. *(3 marks)*
> Direct hardware control / efficient use of memory and speed (advantages); one-to-one with machine code so easy to translate and predict timing. Disadvantage: hardware-specific / not portable; harder to write, read and debug.

**Q8.** Write an LMC program that inputs two numbers and outputs the larger. *(6 marks)* — model answer: `programs/max.lmc`.

**Extension:** `divide.lmc` — integer division and remainder (the same kind of program as OCR's Autumn 2021 Q6). Optional, non-OCR: `array-sum-indexed.lmc` — explain how it works.

## 10. Suggested teaching sequence

1. Fetch–decode–execute (theory) and the LMC as a model.
2. Run `add.lmc` — students *predict* then observe.
3. Sequence → selection (`max.lmc`) → iteration (`countdown.lmc`, `multiply.lmc`).
4. Machine code vs assembly; assemble by hand (two-pass).
5. Sentinel loops, `divide.lmc`.
6. Addressing modes, defined as OCR does (by what the operand holds; see §7.1). Optional extras: LMC-X, and my self-modifying illustration (neither is from OCR).
7. Exam-style questions, hand traces.

## 11. Simulator specification (`lmc`)

### 11.1 Behaviour decisions to fix up front

The LMC is under-specified in a few places, and simulators differ. Decide these deliberately:

| Question | Recommendation |
|---|---|
| ACC range / overflow | Keep ACC as a signed integer. Warn if it leaves −999…999 (options: wrap mod 1000, clamp, or error). Don't silently wrap. |
| `BRZ`/`BRP` test | Test the ACC **value** at the moment of the branch (simplest, matches OCR wording). Some simulators use a flag set by `ADD`/`SUB` — check the Higginson simulator's behaviour if you want to match it. |
| Input range | Default 0–999; make negative input a setting. Reject non-numbers. |
| Illegal opcode (`4xx`, `903`–`998`) | Halt with a clear "illegal instruction" error, showing PC and CIR. (`999` is reserved; see CHECKPOINT.) |
| Executing data | Allowed (it's just a number) — optionally warn when a `DAT` line is executed. |
| Operand on `INP`/`OUT`/`HLT` | Assembler error. |
| Missing operand on `ADD`… | Assembler error. |
| Undefined / duplicate label | Assembler error with line number. |
| Labels | Case-insensitive; must not be a mnemonic; must not start with a digit. The alternative mnemonics (`end`, `in` …) are only instructions in instruction position, so `end HLT` and `BRZ end` still work. |
| More than 100 lines | Assembler error. |
| Infinite loop | Step limit (e.g. 10 000) with a message; runs must be interruptible. |
| Alternative mnemonics | Accept OCR's list (§3): `STO`, `LOAD`, `BR`, `BZ`, `BP`, `IN`, `INPUT`, `COB`, `END`. Implemented. |
| Addressing-mode operands (`#5`, `(5)`, `5,X`) | Assembler error that says the LMC has only direct addressing and shows the `DAT` alternative. Implemented. |
| Non-OCR extension | `OTC` (output as character) = `922` in some simulators — keep behind a setting. |

### 11.2 Suggested types (TypeScript)

As implemented in `src/engine/types.ts` and `src/engine/machine.ts`:

```ts
type Mnemonic = 'ADD' | 'SUB' | 'STA' | 'LDA' | 'BRA' | 'BRZ' | 'BRP' | 'INP' | 'OUT' | 'HLT' | 'DAT';

interface AssembledProgram {
  memory: number[];                  // length 100
  symbols: Record<string, number>;   // label -> address
  lines: { line: number; src: string; addr: number; mnemonic: Mnemonic;
           label?: string; operand?: string; word: number }[];
  dataAddresses: number[];           // mailboxes that came from DAT lines
}

type MachineStatus = 'ready' | 'waiting-input' | 'halted' | 'error';   // Machine.status; registers are Machine.pc/acc/mar/mdr/cir

// One register transfer (a fetch, decode or execute step) - what the UI steps through.
interface MicroStep { phase: 'fetch' | 'decode' | 'execute'; rtn: string; detail: string; addr: number;
                      changes: { reg: string; from: number; to: number }[];
                      read?: number; write?: number; input?: number; output?: number;
                      warning?: string; error?: string; instructionEnd: boolean; }
```

### 11.3 Feature tiers

**Status (web app, Vite + vanilla TypeScript):** *Core* and most of *Teaching* are built (memory grid with disassembly, registers, step-within-the-cycle with the RTN line and values, read/write/next highlighting, assembly beside machine code in the editor gutter, trace table in the §6 format, step back). Also built: breakpoints, speed control, a tabbed reference drawer, and warnings for executing `DAT` and for ACC overflow. **Not built:** `OTC`, a negative-input setting in the UI, "exam mode", the `tests.json` autograder panel, a symbol-table view, trace-table export, and the LMC-X-specific autograder. The extended LMC (§7.1) is built behind `?lmc=extended`, including its optional memory-mapped switches and lamps. The engine (`src/engine`) passes all 32 `tests.json` cases and matches the reference oracle instruction by instruction.

- **Core:** assembler with line-numbered errors; 100-mailbox grid showing both decimal and mnemonic disassembly; registers (PC, ACC, MAR, MDR, CIR); Step / Run / Reset; input queue and output log.
- **Teaching:** step *within* the cycle (fetch → decode → execute → next), showing the RTN line being performed; highlight the mailbox being read/written; assembly ↔ machine-code side by side; symbol table view; trace-table export (matches §6 format).
- **CPU diagram (built):** the Registers card is a small static diagram: control unit, ALU, registers, then the address, data and control buses as separate blocks, then memory. Each micro-step colours what it uses (written registers yellow, read registers dashed blue, buses and memory in the read/write colours). Colour only, no animation; a "Hide diagram" button leaves just the registers. Which parts a step uses is worked out from its register-transfer text in `src/diagram.ts` (tested).
- **Extras:** breakpoints; speed control; "exam mode" (hide symbol names); running `programs/tests.json` as an autograder; addressing-mode demo (the extended LMC in §7.1, behind `?lmc=extended`); warn when self-modifying code executes.

### 11.4 Test corpus

`programs/tests.json` gives `{ program, inputs, outputs }` for 36 cases across the 11 example programs. Load it in your test runner to check your assembler + CPU: any correct implementation must pass all of them.

---

## Sources

- [OCR — H446 specification (v3.0)](https://www.ocr.org.uk/Images/170844-specification-accredited-a-level-gce-computer-science-h446.pdf) — 1.1.1(a)/(b) registers and the cycle; 1.2.4(c)/(d); "Little Man Computer Instruction Set" table in Appendix 5d (read directly)
- [OCR — Delivery Guide, 1.1.1 Structure and function of the processor](https://www.ocr.org.uk/Images/231750-structure-function-processor-delivery-guide.pdf) — Learner Resource 2, the fetch-decode-execute steps, uses "MBR" (read directly)
- [OCR — H446/01 June 2022 mark scheme](https://www.ocr.org.uk/Images/676943-mark-scheme-computer-systems.pdf) — purposes of ACC and PC; "Allow Memory Buffer Register for MDR" (read directly)

- [OCR — Subject Content Clarification Guide, H446](https://www.ocr.org.uk/Images/383613-subject-content-clarification-guide.pdf) — spec 1.2.4(c)/(d), Appendix 5d, addressing "integrated with assembly language" (read directly)
- [OCR — H446/01 Autumn 2021 mark scheme](https://www.ocr.org.uk/Images/666849-mark-scheme-computer-systems.pdf) — Q6(d) addressing modes defined by "the operand" (read directly)
- [OCR — H446/01 sample assessment materials](https://www.ocr.org.uk/Images/170852-unit-h446-1-computer-systems-sample-assessment-materials.pdf) — Q5, LMC listing style (read directly)
- [OCR — Delivery Guide, 1.2.4 Types of programming language](https://ocr.org.uk/qualifications/as-a-level-gce-computer-science-h046-h446-from-2015/delivery-guide/component-cs03-01-computer-systems/delivery-guide-csdg008-types-of-programming-language-124?activity=) — immediate addressing, `#` notation (**seen only as a search snippet; the page wouldn't open for me**)
- [Craig 'n' Dave — OCR A Level SLR7: Assembly language and LMC](https://craigndave.org/videos/ocr-alevel-slr07-assembly-language-and-lmc-language/) (secondary; its spec numbering differs slightly from OCR's own guide)
- [Teach-ICT — OCR H446 LMC](https://teach-ict.com/2016/A_Level_Computing/OCR_H446/1_2_software/124_assembly/lmc/miniweb/index.php)
- [Teach-ICT — OCR H446 Addressing modes](https://www.teach-ict.com/2016/A_Level_Computing/OCR_H446/1_2_software/124_addressing/modes/miniweb/index.php)
- [Wikipedia — Little Man Computer](https://en.wikipedia.org/wiki/Little_Man_Computer)
- OCR's own H446 specification and past papers should be treated as the authority.
