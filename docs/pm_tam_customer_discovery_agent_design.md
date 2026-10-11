# PM/TAM Customer Discovery Agent --- Design Guidance

## 1. Purpose

This document provides design guidance for building a customer-facing
**PM/TAM AI agent** that can conduct structured conversations with
customers to gather information for:

-   New feature requests
-   Product enhancements
-   Bug reports
-   Configuration or usage issues
-   Integration issues
-   Performance issues

The assumed platform is a web application with an AI agent backend and
an existing **Product Knowledge Base (KB)** indexed in **Chroma DB**.

The key architectural principle is:

> **The LLM is responsible for understanding and reasoning. The playbook
> is responsible for process. The KB is responsible for product truth.
> The case state is responsible for memory. The application is
> responsible for control and auditability.**

------------------------------------------------------------------------

## 2. Why a Playbook Is Needed

A generic RAG chatbot can answer product questions, but customer
discovery requires more than answering questions.

The agent must systematically reduce ambiguity until PM, TAM, Support,
or Engineering has enough information to take action.

A playbook provides:

-   Required information to collect
-   Conditional information to collect
-   Conversation stages
-   Rules for deciding the next question
-   Completion criteria
-   Escalation criteria
-   Customer confirmation rules
-   Structured handoff requirements

The Product KB answers:

> **What does the product currently do?**

The playbook answers:

> **What should the agent do next?**

The case state answers:

> **What have we already learned about this customer's request?**

------------------------------------------------------------------------

## 3. Target Architecture

``` text
┌───────────────────────────────────────────────────────────────┐
│                       Web Application                         │
│                                                               │
│ Customer / TAM / PM Chat                                     │
│ Attach screenshots / logs / files                            │
│ Review collected requirements                                │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                     Agent Orchestrator                        │
│                                                               │
│  1. Intent Classifier                                        │
│  2. Conversation State Manager                               │
│  3. Playbook Engine                                           │
│  4. Question Planner                                          │
│  5. Knowledge Retrieval                                       │
│  6. Evidence / Consistency Checker                            │
│  7. Completion Evaluator                                      │
│  8. Handoff Generator                                         │
└───────────────┬─────────────────────┬─────────────────────────┘
                │                     │
                ▼                     ▼
      ┌──────────────────┐   ┌──────────────────────┐
      │ Product KB       │   │ Playbook Config      │
      │                  │   │                      │
      │ Chroma DB        │   │ Feature Request      │
      │ Product docs     │   │ Bug Investigation    │
      │ API docs         │   │ Integration Issue    │
      │ Known issues     │   │ Performance Issue    │
      │ Release notes    │   │ etc.                 │
      └──────────────────┘   └──────────────────────┘
                │
                ▼
      ┌──────────────────────┐
      │ Operational DB       │
      │ PostgreSQL/Firestore │
      │                      │
      │ Conversation         │
      │ Case State           │
      │ Evidence             │
      │ Requirements         │
      │ Decisions            │
      │ Audit Trail          │
      └──────────────────────┘
```

Chroma should not become the storage system for everything.

Use Chroma primarily for semantic retrieval of product knowledge. Store
workflow state, extracted facts, requirements, decisions, evidence
references, and audit information in an operational database.

------------------------------------------------------------------------

## 4. Three Types of Knowledge

### 4.1 Product Knowledge

The existing Chroma DB fits this category.

Examples include:

-   Product documentation
-   Architecture documentation
-   API documentation
-   Release notes
-   Known limitations
-   Configuration documentation
-   Support KB articles
-   Existing functionality
-   Troubleshooting guides
-   Relevant historical issues

This knowledge answers:

> **What do we know about the product?**

### 4.2 Procedural Knowledge / Playbooks

Playbooks define what information the agent should collect and how it
should progress through a customer conversation.

Example:

``` yaml
playbook: feature_request
version: 1.0

required_fields:
  - problem_statement
  - affected_persona
  - current_workflow
  - desired_outcome
  - business_impact
  - example_scenario

recommended_fields:
  - frequency
  - workaround
  - priority
  - affected_volume

conditional_fields:
  integration:
    - external_system
    - integration_direction
    - interface
    - data_exchanged

completion:
  required_fields_complete: true
  unresolved_critical_questions: 0
```

The authoritative playbook should preferably be version-controlled YAML
or JSON.

Playbook descriptions can additionally be indexed for semantic
retrieval, but the workflow definition should remain structured and
deterministic.

### 4.3 Case / Conversation State

This represents what has been learned for one specific customer case.

Example:

``` json
{
  "case_id": "FR-2026-00124",
  "type": "feature_request",

  "problem_statement": {
    "value": "AP users cannot determine why an invoice was disputed.",
    "source": "customer",
    "confidence": 0.95
  },

  "affected_persona": {
    "value": "AP Analyst",
    "source": "customer",
    "confidence": 0.92
  },

  "desired_outcome": null,
  "business_impact": null,

  "open_questions": [
    "What should happen after the dispute reason is selected?"
  ]
}
```

This state belongs in the operational database rather than the vector
database.

------------------------------------------------------------------------

## 5. Do Not Make the LLM the Workflow Engine

A simple implementation might look like:

``` text
Customer Message
      ↓
Chroma Retrieval
      ↓
Large Prompt
      ↓
LLM Response
```

This can work well for demos but becomes difficult to control during
long requirements discussions.

A stronger architecture is:

``` text
Customer Message
       ↓
Information Extraction
       ↓
Update Case State
       ↓
Evaluate Playbook
       ↓
Determine Missing Information
       ↓
Retrieve Relevant Product Knowledge
       ↓
Question Planner
       ↓
LLM Response
       ↓
Customer
```

The LLM performs language understanding and reasoning, while the
application controls the workflow.

------------------------------------------------------------------------

## 6. Case State Model

For a feature request, consider a structure similar to:

``` text
FeatureRequestCase
│
├── identity
│   ├── customer
│   ├── product_area
│   └── requester_role
│
├── problem
│   ├── problem_statement
│   ├── affected_persona
│   ├── business_impact
│   └── frequency
│
├── current_state
│   ├── current_workflow
│   ├── existing_behavior
│   └── workaround
│
├── desired_state
│   ├── desired_outcome
│   ├── proposed_solution
│   └── acceptance_criteria
│
├── examples
│   ├── scenario
│   ├── sample_data
│   └── screenshots
│
├── dependencies
│   ├── integrations
│   ├── APIs
│   └── external_systems
│
└── analysis
    ├── possible_existing_feature
    ├── related_features
    ├── assumptions
    ├── conflicts
    ├── open_questions
    └── confidence
```

A critical distinction is:

``` text
problem_statement
desired_outcome
proposed_solution
```

For example, if a customer says:

> We need a customizable dispute template.

The initial state should be:

``` text
Proposed solution:
Customizable dispute template

Underlying problem:
UNKNOWN

Desired outcome:
UNKNOWN
```

The agent should discover the underlying need rather than immediately
converting the proposed implementation into a requirement.

------------------------------------------------------------------------

## 7. Provenance for Every Important Fact

Avoid storing only:

``` json
{
  "business_impact": "Invoice processing is delayed."
}
```

Prefer:

``` json
{
  "value": "Invoice processing is delayed approximately two days.",
  "source_type": "customer",
  "source_message_id": "msg_183",
  "confidence": 0.96,
  "status": "customer_stated"
}
```

Useful statuses include:

-   `unknown`
-   `inferred`
-   `customer_stated`
-   `customer_confirmed`
-   `kb_supported`
-   `conflicting`

This enables traceability from a generated requirement back to the
customer statement or KB evidence that supports it.

------------------------------------------------------------------------

## 8. Playbook Engine

The playbook engine evaluates the current structured state rather than
relying on the LLM to remember every requirement.

Simple example:

``` python
def evaluate_feature_request(case):
    missing = []

    if not case.problem_statement:
        missing.append("problem_statement")

    if not case.affected_persona:
        missing.append("affected_persona")

    if not case.current_workflow:
        missing.append("current_workflow")

    if not case.desired_outcome:
        missing.append("desired_outcome")

    if not case.business_impact:
        missing.append("business_impact")

    return missing
```

Eventually, support conditional rules:

``` text
IF integration == true
THEN require:
    external_system
    integration_direction
    interface
    data_exchanged

IF requested behavior conflicts with existing product behavior
THEN:
    retrieve relevant documentation
    clarify with customer

IF workaround exists
THEN:
    collect workaround limitations

IF customer says "sometimes"
THEN:
    ask about frequency and triggering conditions

IF customer reports production failure
THEN:
    consider switching to Bug Playbook
```

------------------------------------------------------------------------

## 9. Dynamic Playbook Selection

The initial classification should not permanently determine the
workflow.

Example:

``` text
Customer:
"Invoices aren't automatically approved anymore."

Initial classification:
BUG
```

Further conversation might reveal:

``` text
Customer:
"We want invoices from this supplier to bypass approval."

Updated classification:

Bug confidence: 0.20
Configuration/feature request confidence: 0.80
```

The orchestrator should be able to transition:

``` text
Bug Playbook
      ↓
Configuration Investigation
      ↓
Feature Request Playbook
```

------------------------------------------------------------------------

## 10. Separate Question Planning from Question Wording

The system should first determine the objective of the next question.

Example:

``` json
{
  "next_goal": "understand_business_impact",
  "reason": "business_impact is required and currently unknown",
  "priority": "high"
}
```

Then the LLM generates natural customer-facing language:

> What impact does this have on your AP team today---for example, does
> it delay invoice processing or require additional manual work?

This separation improves explainability and evaluation.

------------------------------------------------------------------------

## 11. Question Prioritization

Do not simply ask every missing field in sequence.

Conceptually:

``` text
Question Value =
    Importance
  × Uncertainty
  × Information Gain
  × Relevance
  - Customer Effort
```

Suppose the missing information is:

``` text
business impact
frequency
affected users
workaround
priority
```

The planner may determine:

``` text
1. Business impact
2. Workaround
3. Frequency
```

One natural question may also gather several fields:

> How often does this happen, and when it does, what does your team have
> to do manually?

This may capture frequency, impact, and workaround together.

------------------------------------------------------------------------

## 12. Product Knowledge Retrieval

Avoid performing generic Chroma similarity search for every customer
message.

Introduce a retrieval planner.

Example customer statement:

> We want to customize the dispute notification based on dispute reason.

Possible retrieval queries:

``` text
invoice dispute notification template

customized template by dispute reason

invoice dispute reason configuration
```

The system may search separately for:

-   Existing functionality
-   Product documentation
-   Known limitations
-   Related features
-   API behavior
-   Release notes

### Recommended Chroma Metadata

Attach useful metadata to every indexed document or chunk.

Example:

``` json
{
  "product": "Invoicing",
  "component": "Invoice Disputes",
  "document_type": "product_documentation",
  "version": "R46",
  "status": "current",
  "source": "internal_product_doc",
  "updated_at": "2026-10-01"
}
```

Retrieval should combine:

``` text
Semantic similarity
+
Metadata filtering
```

rather than relying only on vector similarity.

------------------------------------------------------------------------

## 13. Knowledge Service Abstraction

Avoid tightly coupling the agent to Chroma.

Introduce an abstraction such as:

``` text
KnowledgeService

search_product()
search_api()
search_known_issues()
search_release_notes()
search_requirements()
search_historical_cases()
```

Initially, these functions may all use Chroma.

Later, different sources can be introduced:

``` text
Product docs        → Chroma
Jira                → Jira API/Search
Support cases       → Search index
Source code         → Code index
Customer docs       → Customer-specific vector collection
Requirements        → PostgreSQL + vector index
```

The agent interacts with the Knowledge Service rather than directly with
a particular storage technology.

------------------------------------------------------------------------

## 14. Evidence Layer

Customer-facing product claims should be evidence-backed.

Example:

``` json
{
  "claim": "Different templates can be configured per dispute reason.",
  "evidence": [
    {
      "doc_id": "DOC-283",
      "chunk_id": "CH-22",
      "retrieval_score": 0.89
    }
  ],
  "confidence": 0.63
}
```

Define behavior by confidence and evidence quality:

``` text
Strong evidence
→ Answer directly and cite/support the claim.

Partial evidence
→ Qualify the answer.

Weak or conflicting evidence
→ Do not assert the behavior as fact.
→ Request clarification or escalate.
```

Do not use vector similarity alone as the confidence score. Confidence
should consider source authority, freshness, agreement among sources,
and whether the retrieved text directly supports the claim.

------------------------------------------------------------------------

## 15. Contradiction Detection

The system should explicitly detect conflicts between customer
statements and the Product KB.

Example:

``` text
Customer belief:
Templates can already be configured per dispute reason.

KB evidence:
The standard notification uses one global template.

Result:
CONFLICT
```

Record:

``` text
Customer claim
KB claim
Supporting evidence
Confidence
Resolution status
```

The next action should normally be clarification rather than silently
selecting one version.

------------------------------------------------------------------------

## 16. Requirement Readiness

Instead of only tracking `complete = true/false`, maintain readiness
based on deterministic criteria.

Example:

``` text
Problem clarity              Complete
Persona                      Complete
Current workflow             Complete
Desired outcome              Complete
Business impact              Partial
Examples                     Complete
Acceptance criteria          Partial
Dependencies                 Missing

Open critical questions: 2
```

A weighted score can also be useful:

``` text
problem_statement       20
current_workflow        15
desired_outcome         20
example                 15
business_impact         10
frequency                5
workaround               5
dependencies            10
```

Possible stages:

``` text
0–50     Discovery
50–75    Partially Defined
75–90    PM Review Ready
90+      Engineering Review Ready
```

The score should be derived from explicit rules rather than an arbitrary
LLM-generated percentage.

------------------------------------------------------------------------

## 17. Feature Request State Machine

``` text
NEW
 ↓
CLASSIFY
 ↓
UNDERSTAND_PROBLEM
 ↓
UNDERSTAND_CURRENT_WORKFLOW
 ↓
UNDERSTAND_DESIRED_OUTCOME
 ↓
CHECK_EXISTING_PRODUCT
 ↓
CLARIFY_GAPS
 ↓
DEFINE_REQUIREMENTS
 ↓
DEFINE_ACCEPTANCE_CRITERIA
 ↓
CUSTOMER_CONFIRMATION
 ↓
PM_REVIEW_READY
```

------------------------------------------------------------------------

## 18. Bug State Machine

``` text
NEW
 ↓
CLASSIFY
 ↓
EXPECTED_VS_ACTUAL
 ↓
ENVIRONMENT
 ↓
REPRODUCTION
 ↓
EVIDENCE_COLLECTION
 ↓
KB / KNOWN ISSUE SEARCH
 ↓
IMPACT / SEVERITY
 ↓
CLASSIFICATION
 ├── BUG
 ├── CONFIGURATION
 ├── KNOWN ISSUE
 ├── EXPECTED BEHAVIOR
 └── FEATURE GAP
 ↓
ENGINEERING_READY
```

------------------------------------------------------------------------

## 19. Bug Evidence Package

The final bug artifact should be structured and engineering-ready.

``` text
BUG REPORT

Summary
-------
...

Environment
-----------
Customer:
Environment:
Version:
Browser/API:
Integration:

Expected Behavior
-----------------
...

Actual Behavior
---------------
...

Reproduction
------------
1.
2.
3.

Frequency
---------
...

First Observed
--------------
...

Business Impact
---------------
...

Evidence
--------
Screenshot:
Logs:
Request ID:
API request:
API response:

Workaround
----------
...

Related KB
----------
...

Agent Assessment
----------------
Likely bug:
Configuration issue:
Known limitation:

Missing Information
-------------------
...

Engineering Ready
-----------------
YES / NO
```

------------------------------------------------------------------------

## 20. Data Model

Keep raw conversation separate from derived knowledge.

Recommended entities:

``` text
Case
Conversation
Message
ExtractedFact
Requirement
Evidence
Question
Decision
Assumption
OpenQuestion
Artifact
PlaybookExecution
AgentTurn
```

Relationships:

``` text
Case
 ├── Conversations
 │    └── Messages
 ├── Facts
 ├── Requirements
 ├── Evidence
 ├── Decisions
 ├── Assumptions
 ├── OpenQuestions
 └── Artifacts
```

------------------------------------------------------------------------

## 21. Requirements as First-Class Objects

Do not leave requirements buried inside conversation summaries.

Example:

``` json
{
  "id": "FR-REQ-007",
  "statement": "The system shall allow an administrator to configure a notification template for each dispute reason.",
  "type": "functional",
  "source": "customer",
  "status": "draft",
  "confidence": 0.87,
  "customer_confirmed": false,
  "evidence": [
    "message-123",
    "message-129"
  ],
  "dependencies": [
    "dispute_reason"
  ]
}
```

This allows downstream PM and engineering workflows to reason directly
over requirements.

------------------------------------------------------------------------

## 22. Assumption Register

AI systems often silently fill information gaps. Make assumptions
explicit.

Example:

``` text
ASSUMPTION A-12

Assumption:
Each invoice can have only one active dispute reason.

Source:
Inferred from available documentation.

Customer Confirmed:
NO

Impact if Incorrect:
HIGH
```

High-impact unconfirmed assumptions should automatically become
candidate clarification questions.

------------------------------------------------------------------------

## 23. Customer Confirmation

Before a feature request is marked ready, generate a concise
customer-facing summary.

Example:

``` text
Here's my understanding:

Current situation:
...

Problem:
...

Desired behavior:
...

Example:
...

Business impact:
...

Requirements:
1.
2.
3.

Open questions:
...

Is this an accurate description of what you're requesting?
```

After explicit confirmation:

``` text
customer_confirmed = true
```

This creates a clear distinction between AI interpretation and
customer-confirmed requirements.

------------------------------------------------------------------------

## 24. Prompt Architecture

Avoid one enormous system prompt.

Use layered context:

``` text
SYSTEM POLICY
     ↓
ROLE POLICY
     ↓
ACTIVE PLAYBOOK
     ↓
CURRENT CASE STATE
     ↓
RETRIEVED PRODUCT EVIDENCE
     ↓
QUESTION PLAN
     ↓
CUSTOMER MESSAGE
```

### System Policy Example

``` text
Never invent product functionality.
Never promise roadmap commitments or delivery dates.
Separate facts, assumptions, and proposals.
Use product evidence when making product claims.
Escalate when authoritative information is unavailable.
```

### PM/TAM Role Policy

``` text
Your goal is to understand the customer's underlying problem
and collect sufficient information for PM, TAM, Support, and
Engineering review.
```

### Active Playbook Context

``` text
Current phase:
UNDERSTAND_CURRENT_WORKFLOW

Required information:
- current workflow
- actors
- trigger
- workflow steps
- failure or pain point
```

### Current State

``` text
Known:
persona = AP Analyst
problem = ...

Unknown:
current_workflow
frequency
workaround
```

### Evidence

Provide only relevant retrieved evidence rather than dumping large
portions of the KB into the prompt.

------------------------------------------------------------------------

## 25. Agent Execution Loop

Conceptual backend flow:

``` python
def handle_message(case_id, message):

    case = load_case(case_id)

    # 1. Extract structured facts from the message
    facts = extract_facts(message, case)

    # 2. Merge them into case state
    case = merge_facts(case, facts)

    # 3. Re-classify when necessary
    intent = classify_case(case)

    # 4. Select the active playbook
    playbook = get_playbook(intent)

    # 5. Evaluate missing or conflicting information
    gaps = playbook.evaluate(case)

    # 6. Determine whether product knowledge is required
    retrieval_plan = plan_retrieval(case, message, gaps)

    # 7. Retrieve supporting evidence
    evidence = knowledge_service.retrieve(retrieval_plan)

    # 8. Detect contradictions
    conflicts = detect_conflicts(case, evidence)

    # 9. Determine the next conversation objective
    next_action = plan_next_action(
        case,
        gaps,
        evidence,
        conflicts
    )

    # 10. Generate the customer-facing response
    response = generate_response(
        case,
        evidence,
        next_action
    )

    # 11. Persist state and execution trace
    save_case(case)
    save_execution_trace(...)

    return response
```

------------------------------------------------------------------------

## 26. Global Product KB vs Customer Context

Keep these logically and operationally separate.

### Global Product KB

``` text
Product documentation
Architecture
Known limitations
API documentation
Release notes
Troubleshooting documentation
```

### Customer Context

``` text
Customer configuration
Previous cases
Customer integrations
Customizations
Environment
Historical decisions
Customer-specific documentation
```

Every retrieval should enforce access boundaries such as:

``` text
tenant_id
customer_id
access_scope
```

before or during semantic retrieval.

This prevents information from one customer from leaking into another
customer's conversation.

------------------------------------------------------------------------

## 27. Agent Actions

Define explicit actions rather than letting the model freely improvise
workflow behavior.

Recommended actions:

``` text
ASK_CUSTOMER
ANSWER_CUSTOMER
SEARCH_KB
REQUEST_ARTIFACT
SUMMARIZE
CONFIRM_REQUIREMENT
SWITCH_PLAYBOOK
ESCALATE_PM
ESCALATE_TAM
ESCALATE_SUPPORT
ESCALATE_ENGINEERING
CREATE_HANDOFF
```

Example policies:

``` text
IF product behavior cannot be verified
THEN ESCALATE_PM or request verification

IF customer reports critical production impact
THEN ESCALATE_SUPPORT

IF customer asks for a roadmap commitment
THEN ESCALATE_PM

IF required reproduction evidence is missing
THEN REQUEST_ARTIFACT
```

------------------------------------------------------------------------

## 28. Observability

For every agent turn, record enough information to explain why the agent
behaved as it did.

Example:

``` text
AgentTurn

customer_message
intent
active_playbook
playbook_phase

facts_extracted

retrieval_queries
documents_retrieved

missing_fields_before
missing_fields_after

conflicts_detected
assumptions_created

next_action
question_goal

llm_response

confidence
latency
token_usage
```

This enables debugging questions such as:

> Why did the agent ask this question?

The system can answer:

``` text
business_impact = UNKNOWN
playbook requires business_impact
question planner selected business_impact as the highest-value gap
```

------------------------------------------------------------------------

## 29. Evaluation Strategy

Evaluation should be designed together with the workflow.

Build a scenario suite such as:

``` text
TEST-001
Simple feature request

TEST-002
Customer proposes a solution without explaining the problem

TEST-003
Existing functionality already solves the request

TEST-004
Reported bug is actually configuration

TEST-005
Feature request initially appears to be a bug

TEST-006
Customer provides incomplete reproduction information

TEST-007
Customer statement contradicts documentation

TEST-008
Product KB has insufficient information

TEST-009
Customer asks about roadmap commitments

TEST-010
Customer asks the agent to promise a delivery date
```

### Suggested Metrics

  Metric                             Desired Direction
  ---------------------------------- -------------------
  Required-field completeness        High
  Unsupported product claims         Near zero
  Redundant questions                Low
  Customer corrections               Low
  Engineering follow-up required     Low
  Correct request classification     High
  Evidence-backed product claims     High
  Important assumptions identified   High
  Conversation length                Reasonable
  PM editing required                Low

A particularly useful business metric is:

> **Percentage of agent-generated cases accepted by Engineering without
> requiring another customer clarification meeting.**

------------------------------------------------------------------------

## 30. Recommended Implementation Phases

### V1 --- Structured Discovery

Implement:

-   Feature request playbook
-   Bug playbook
-   Structured case state
-   Fact extraction
-   Missing-field detection
-   Basic Chroma retrieval
-   Customer confirmation
-   Structured handoff generation
-   PM/TAM human review

Goal:

> Produce consistently structured, reviewable customer intake.

### V2 --- Intelligent Questioning

Add:

-   Question planning
-   Adaptive conversation
-   Conditional playbook rules
-   Contradiction detection
-   Assumption tracking
-   Retrieval planning
-   Requirement readiness
-   Dynamic playbook switching

Goal:

> Reduce unnecessary questions while increasing requirement
> completeness.

### V3 --- Enterprise Integration

Add integrations with:

-   Jira
-   Support/ticket systems
-   Customer context
-   Historical cases
-   Attachments
-   Screenshots
-   Logs
-   API traces
-   PM approval workflows
-   Engineering handoff

Goal:

> Turn the agent into part of the actual PM/TAM/Engineering workflow.

### V4 --- Evaluation and Continuous Improvement

Capture:

-   PM edits to generated requirements
-   Engineering follow-up questions
-   Customer corrections
-   Incorrect product claims
-   Missing playbook fields
-   Bad retrieval results
-   Escalation outcomes

Use these signals to improve:

-   Playbooks
-   Retrieval
-   Prompts
-   Evaluation datasets
-   Completion criteria

Do not allow the agent to automatically learn arbitrary workflow
behavior from individual conversations.

------------------------------------------------------------------------

## 31. Recommended Initial Component Boundaries

A practical backend decomposition could be:

``` text
agent-service
│
├── orchestrator
│
├── intent-classifier
│
├── fact-extractor
│
├── question-planner
│
├── response-generator
│
└── handoff-generator
│
├── playbook-service
│   ├── feature-request.yaml
│   ├── bug-report.yaml
│   ├── integration-issue.yaml
│   └── playbook-evaluator
│
├── knowledge-service
│   ├── chroma-retriever
│   ├── retrieval-planner
│   ├── evidence-builder
│   └── contradiction-detector
│
├── case-service
│   ├── case-state
│   ├── facts
│   ├── requirements
│   ├── assumptions
│   ├── evidence
│   └── open-questions
│
└── evaluation-service
    ├── execution-trace
    ├── readiness-evaluator
    ├── scenario-tests
    └── metrics
```

These do not necessarily need to be separate deployable microservices.
They can initially be modules within one backend service while
maintaining clear architectural boundaries.

------------------------------------------------------------------------

## 32. Core Design Principles

### Principle 1 --- Product truth comes from evidence

The LLM should not invent current product behavior.

### Principle 2 --- Conversation is not state

Persist important facts and requirements explicitly.

### Principle 3 --- Customer solutions are not automatically requirements

Discover the underlying problem and desired outcome.

### Principle 4 --- The playbook controls the process

The LLM can reason about the conversation, but completion criteria and
workflow rules should remain explicit.

### Principle 5 --- Every important statement should have provenance

Know whether something came from the customer, KB, agent inference, or
PM/TAM.

### Principle 6 --- Assumptions must be visible

High-impact assumptions should become clarification questions.

### Principle 7 --- Retrieval should be intentional

Retrieve product knowledge when it is relevant to the current
conversation goal rather than blindly searching on every turn.

### Principle 8 --- Human escalation is a valid agent outcome

The agent should know when not to answer.

### Principle 9 --- Customer confirmation matters

Separate AI interpretation from customer-confirmed requirements.

### Principle 10 --- Design for evaluation

Every important agent decision should be observable and testable.

------------------------------------------------------------------------

## 33. Recommended Next Step

Given an existing web application, AI agent backend, and Chroma Product
KB, the next major architectural investment should be:

``` text
1. Case State Model
        ↓
2. Feature Request + Bug Playbooks
        ↓
3. Playbook Evaluator
        ↓
4. Structured Fact Extraction
        ↓
5. Question Planner
        ↓
6. Evidence-Aware Chroma Retrieval
        ↓
7. Customer Confirmation
        ↓
8. Structured PM/Engineering Handoff
        ↓
9. Evaluation Framework
```

Avoid spending the next iteration primarily on increasingly large
prompts or more sophisticated vector search.

The major missing capability is a deterministic definition of:

> **What information does a good PM/TAM discovery conversation need,
> what is still missing, what should be asked next, and when is the case
> ready to hand off?**

Once that foundation exists, retrieval quality, additional tools, more
specialized agents, and integrations can be improved incrementally
without losing control of the workflow.
