import {
  CLEARANCE_DEPARTMENTS_DEFAULT, EXIT_INTERVIEW_QUESTIONS, JOB_CONFIRMATION_CRITERIA,
} from '@kormo/shared';

import type { OrgResult } from './org';
import {
  TODAY, addDays, addMonths, chance, d, iso, log, pick, pickN, prisma, randInt,
  round2, section,
} from './lib';

/** PMS, onboarding, and e-resignation + clearance. */
export async function seedLifecycle(org: OrgResult): Promise<void> {
  // ══ performance management ═════════════════════════════════════════
  section('Performance management');

  const year = TODAY.getUTCFullYear();
  const fyLabel = `FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`;

  // Two cycles: the closed first half and the live second half.
  const cycleH1 = await prisma.goalCycle.create({
    data: {
      companyId: org.primaryCompanyId,
      name: `${fyLabel} H1`,
      startDate: d(`${year}-01-01`),
      endDate: d(`${year}-06-30`),
      feedbackStartDate: d(`${year}-06-15`),
      feedbackEndDate: d(`${year}-07-15`),
      isActive: false,
    },
  });
  const cycleH2 = await prisma.goalCycle.create({
    data: {
      companyId: org.primaryCompanyId,
      name: `${fyLabel} H2`,
      startDate: d(`${year}-07-01`),
      endDate: d(`${year}-12-31`),
      feedbackStartDate: d(`${year}-12-15`),
      feedbackEndDate: d(`${year + 1}-01-15`),
      isActive: true,
    },
  });
  log('created goal cycles', `${fyLabel} H1 (closed), H2 (live)`);

  // Only confirmed employees are enrolled — probationers are assessed
  // through job confirmation instead. This is why some accounts see the
  // "you are not in a goal cycle yet" empty state.
  const enrollable = org.employees.filter(
    (e) => e.companyId === org.primaryCompanyId && e.employmentStatus === 'PERMANENT',
  );
  const enrolled = enrollable.filter(() => chance(82));

  await prisma.goalCycleMember.createMany({
    data: [
      ...enrolled.map((e) => ({ goalCycleId: cycleH1.id, employeeId: e.id })),
      ...enrolled.map((e) => ({ goalCycleId: cycleH2.id, employeeId: e.id })),
    ],
    skipDuplicates: true,
  });
  log('enrolled employees in cycles', `${enrolled.length} of ${enrollable.length} confirmed staff`);

  const GOAL_TEMPLATES: Record<string, { title: string; metric: string; target: string }[]> = {
    Technology: [
      { title: 'Cut p95 API latency on the order path', metric: 'p95 latency', target: '< 400 ms' },
      { title: 'Raise automated test coverage on billing', metric: 'line coverage', target: '≥ 80%' },
      { title: 'Ship the warehouse stock-sync service', metric: 'delivery', target: 'live by Q4' },
      { title: 'Reduce Sev-1 incidents quarter on quarter', metric: 'Sev-1 count', target: '≤ 2 per quarter' },
    ],
    'Human Resources': [
      { title: 'Reduce time-to-hire for engineering roles', metric: 'days to offer', target: '≤ 28 days' },
      { title: 'Bring onboarding task completion to day-one readiness', metric: 'day-1 completion', target: '≥ 95%' },
      { title: 'Lift voluntary attrition down from last year', metric: 'annualised attrition', target: '< 14%' },
    ],
    'Finance & Accounts': [
      { title: 'Close the monthly books faster', metric: 'working days to close', target: '≤ 5 days' },
      { title: 'Clear the aged receivables backlog', metric: '90+ day AR', target: '< 3% of revenue' },
      { title: 'Complete the FY tax filing without adjustment', metric: 'NBR queries', target: 'zero' },
    ],
    'Sales & Distribution': [
      { title: 'Grow territory revenue', metric: 'revenue vs LY', target: '+18%' },
      { title: 'Increase active outlet coverage', metric: 'active outlets', target: '+120 outlets' },
      { title: 'Improve collection efficiency', metric: 'collection ratio', target: '≥ 92%' },
    ],
    'Field Force': [
      { title: 'Hit the monthly visit plan consistently', metric: 'plan adherence', target: '≥ 90%' },
      { title: 'Convert detailing calls into orders', metric: 'call-to-order rate', target: '≥ 35%' },
    ],
    default: [
      { title: 'Deliver the departmental annual plan', metric: 'milestones met', target: '100%' },
      { title: 'Complete the mandated compliance training', metric: 'completion', target: 'by Q3' },
      { title: 'Improve internal stakeholder satisfaction', metric: 'internal NPS', target: '≥ 40' },
    ],
  };

  const deptNameById = new Map(org.departments.map((x) => [x.id, x.name]));
  const goalRows: { employeeId: bigint; cycleId: number; title: string; metric: string; target: string; weight: number; progress: number; status: string; dueDate: Date }[] = [];

  for (const emp of enrolled) {
    const deptName = deptNameById.get(emp.departmentId) ?? 'default';
    const templates = GOAL_TEMPLATES[deptName] ?? GOAL_TEMPLATES.default;

    for (const cycle of [cycleH1, cycleH2]) {
      const count = randInt(3, Math.min(4, templates.length));
      const chosen = pickN(templates, count);
      // Weights must total 100 — split them and hand the remainder to the first goal.
      const baseWeight = Math.floor(100 / chosen.length);
      const weights = chosen.map(() => baseWeight);
      weights[0] += 100 - baseWeight * chosen.length;

      const isClosed = cycle.id === cycleH1.id;
      chosen.forEach((template, i) => {
        const progress = isClosed ? randInt(70, 100) : randInt(10, 85);
        goalRows.push({
          employeeId: emp.id,
          cycleId: cycle.id,
          title: template.title,
          metric: template.metric,
          target: template.target,
          weight: weights[i],
          progress,
          status: isClosed ? 'COMPLETED' : progress > 70 ? 'SUBMITTED' : 'ACTIVE',
          dueDate: isClosed ? d(`${year}-06-30`) : d(`${year}-12-31`),
        });
      });
    }
  }

  const createdGoals: { id: number; employeeId: bigint; status: string }[] = [];
  for (const row of goalRows) {
    const goal = await prisma.goal.create({
      data: {
        goalCycleId: row.cycleId,
        employeeId: row.employeeId,
        title: row.title,
        description: `${row.title}. Measured on ${row.metric}; target ${row.target}.`,
        metric: row.metric,
        target: row.target,
        weight: row.weight,
        progressPct: row.progress,
        status: row.status as never,
        dueDate: row.dueDate,
      },
    });
    createdGoals.push({ id: goal.id, employeeId: row.employeeId, status: row.status });
  }
  log('created goals', `${createdGoals.length} across 2 cycles`);

  // ── goal reviews: self-assessment then manager review ──────────────
  const reviewRows: any[] = [];
  const empById = new Map(org.employees.map((e) => [String(e.id), e]));
  for (const goal of createdGoals) {
    if (!['COMPLETED', 'SUBMITTED', 'IN_REVIEW'].includes(goal.status)) continue;
    const emp = empById.get(String(goal.employeeId));
    if (!emp) continue;

    reviewRows.push({
      goalId: goal.id,
      reviewerId: emp.id,
      stage: 'SELF_ASSESSMENT',
      rating: randInt(3, 5),
      comment: pick([
        'Delivered the target ahead of schedule despite the dependency slip.',
        'Met the metric; the second half needed more stakeholder alignment than planned.',
        'Partially met — external vendor delays cost us about three weeks.',
        'Exceeded target and documented the approach for the wider team.',
      ]),
      submittedAt: addDays(TODAY, -randInt(10, 70)),
    });

    if (goal.status === 'COMPLETED' && emp.lineManagerId) {
      reviewRows.push({
        goalId: goal.id,
        reviewerId: emp.lineManagerId,
        stage: 'MANAGER_REVIEW',
        rating: randInt(3, 5),
        comment: pick([
          'Agreed with the self-assessment. Strong ownership throughout.',
          'Good outcome. Would like to see earlier escalation of blockers next cycle.',
          'Target met. Discussed stretch scope for the next cycle.',
          'Solid delivery under a tight timeline.',
        ]),
        submittedAt: addDays(TODAY, -randInt(5, 40)),
      });
    }
  }
  await prisma.goalReview.createMany({ data: reviewRows });
  log('created goal reviews', `${reviewRows.length} (self + manager)`);

  // ── job confirmation reviews for probationers ──────────────────────
  const probationers = org.employees.filter((e) => e.employmentStatus === 'PROBATION');
  const confirmationRows: any[] = [];
  for (const emp of probationers) {
    // Probation runs six months; the review falls due two weeks before.
    const dueDate = addDays(addMonths(emp.joiningDate, 6), -14);
    const isDue = dueDate <= TODAY;
    const scorecard = JOB_CONFIRMATION_CRITERIA.map((criterion) => ({
      criterion,
      score: randInt(3, 5),
    }));
    const overall = round2(scorecard.reduce((s, c) => s + c.score, 0) / scorecard.length);

    const decision = !isDue
      ? 'PENDING'
      : overall >= 4 ? 'CONFIRMED' : overall >= 3.2 ? 'EXTENDED' : 'TERMINATED';

    confirmationRows.push({
      employeeId: emp.id,
      reviewerId: emp.lineManagerId,
      dueDate,
      stage: isDue ? (decision === 'PENDING' ? 'MANAGER_REVIEW' : 'COMPLETED') : 'SELF_ASSESSMENT',
      decision,
      scorecard: isDue ? scorecard : null,
      overallScore: isDue ? overall : null,
      strengths: isDue
        ? pick([
            'Picks up new domains quickly and asks good questions.',
            'Reliable, punctual, and well liked across the team.',
            'Strong technical fundamentals and clean documentation habits.',
          ])
        : null,
      improvements: isDue
        ? pick([
            'Needs to communicate blockers earlier.',
            'Could take more ownership of end-to-end delivery.',
            'Estimation accuracy should improve with experience.',
          ])
        : null,
      extendedToDate: decision === 'EXTENDED' ? addMonths(dueDate, 3) : null,
      completedAt: decision === 'PENDING' || !isDue ? null : addDays(dueDate, randInt(1, 10)),
      createdAt: addDays(dueDate, -30),
    });
  }
  await prisma.jobConfirmationReview.createMany({ data: confirmationRows });
  log('created job confirmation reviews', `${confirmationRows.length} probationers (${confirmationRows.filter((r) => r.decision === 'PENDING').length} pending)`);

  // ══ onboarding ═════════════════════════════════════════════════════
  section('Onboarding');

  const TEMPLATE_ITEMS: { lane: 'EMPLOYEE' | 'HR' | 'IT' | 'MANAGER'; title: string; description: string; dueOffsetDays: number }[] = [
    { lane: 'HR', title: 'Collect signed offer & appointment letter', description: 'Both copies signed and filed against the employee record.', dueOffsetDays: -5 },
    { lane: 'HR', title: 'Verify academic & experience certificates', description: 'Originals checked against the submitted photocopies.', dueOffsetDays: -2 },
    { lane: 'HR', title: 'Create payroll & bank disbursement record', description: 'Bank account, routing number and transaction type captured.', dueOffsetDays: 1 },
    { lane: 'HR', title: 'Enrol in leave & attendance policy', description: 'Assign the leave policy and the attendance roster.', dueOffsetDays: 0 },
    { lane: 'HR', title: 'Schedule induction session', description: 'Company overview, code of conduct and benefits walkthrough.', dueOffsetDays: 2 },
    { lane: 'IT', title: 'Provision official email & SSO account', description: 'Create the account and enforce MFA enrolment.', dueOffsetDays: -1 },
    { lane: 'IT', title: 'Issue laptop & peripherals', description: 'Asset tagged and recorded in the asset register.', dueOffsetDays: 0 },
    { lane: 'IT', title: 'Grant access to team tools', description: 'Repository, ticketing and VPN access per role matrix.', dueOffsetDays: 1 },
    { lane: 'IT', title: 'Issue RFID access card', description: 'Card mapped to the employee RFID field for attendance punches.', dueOffsetDays: 0 },
    { lane: 'EMPLOYEE', title: 'Complete personal profile', description: 'Addresses, emergency contact, nominee and statutory IDs.', dueOffsetDays: 2 },
    { lane: 'EMPLOYEE', title: 'Upload NID / passport copy', description: 'Clear scan of both sides.', dueOffsetDays: 2 },
    { lane: 'EMPLOYEE', title: 'Nominate provident fund beneficiary', description: 'Nominee details with share percentages totalling 100%.', dueOffsetDays: 5 },
    { lane: 'EMPLOYEE', title: 'Acknowledge company policies', description: 'Code of conduct, IT acceptable use and leave policy.', dueOffsetDays: 3 },
    { lane: 'MANAGER', title: 'Prepare 30/60/90 day plan', description: 'Written expectations for the first three months.', dueOffsetDays: 0 },
    { lane: 'MANAGER', title: 'Assign onboarding buddy', description: 'A peer to shadow for the first two weeks.', dueOffsetDays: -1 },
    { lane: 'MANAGER', title: 'Introduce to team & stakeholders', description: 'Team standup plus key cross-functional contacts.', dueOffsetDays: 1 },
    { lane: 'MANAGER', title: 'Set probation goals in PMS', description: 'Goals that the confirmation review will be scored against.', dueOffsetDays: 7 },
  ];

  const template = await prisma.onboardingTemplate.create({
    data: {
      companyId: org.primaryCompanyId,
      name: 'Standard New Joiner Onboarding',
      isDefault: true,
      items: {
        create: TEMPLATE_ITEMS.map((item, i) => ({
          lane: item.lane,
          title: item.title,
          description: item.description,
          dueOffsetDays: item.dueOffsetDays,
          isMandatory: true,
          sortOrder: i,
        })),
      },
    },
  });
  const templateItems = await prisma.onboardingTemplateItem.findMany({
    where: { templateId: template.id },
    orderBy: { sortOrder: 'asc' },
  });
  log('created onboarding template', `${templateItems.length} tasks across 4 lanes`);

  // Anyone who joined within the last 90 days, plus a few future joiners,
  // has a live onboarding checklist.
  const hrAdmin = org.employees.find((e) => e.username === 'hr.admin')!;
  const itAdmin = org.employees.find((e) => e.username === 'admin')!;
  const joiners = org.employees.filter((e) => e.joiningDate >= addDays(TODAY, -90));

  const taskRows: any[] = [];
  for (const emp of joiners) {
    // The further past the joining date, the more is done.
    const daysSinceJoining = Math.floor((TODAY.getTime() - emp.joiningDate.getTime()) / 86_400_000);
    const completionBias = Math.min(95, 25 + daysSinceJoining * 3);

    for (const item of templateItems) {
      const dueDate = addDays(emp.joiningDate, item.dueOffsetDays);
      const assigneeId =
        item.lane === 'HR' ? hrAdmin.id
        : item.lane === 'IT' ? itAdmin.id
        : item.lane === 'MANAGER' ? emp.lineManagerId
        : emp.id;

      const overdue = dueDate < TODAY;
      const status = !overdue
        ? chance(30) ? 'IN_PROGRESS' : 'PENDING'
        : chance(completionBias) ? 'DONE' : chance(20) ? 'BLOCKED' : 'IN_PROGRESS';

      taskRows.push({
        employeeId: emp.id,
        templateItemId: item.id,
        lane: item.lane,
        title: item.title,
        description: item.description,
        assigneeId,
        dueDate,
        status,
        completedAt: status === 'DONE' ? addDays(dueDate, randInt(-1, 3)) : null,
        note: status === 'BLOCKED'
          ? pick([
              'Waiting on the original certificates from the employee.',
              'Laptop stock arriving next week — interim machine issued.',
              'Bank account details still pending.',
            ])
          : null,
        sortOrder: item.sortOrder,
        createdAt: addDays(emp.joiningDate, -7),
      });
    }
  }
  await prisma.onboardingTask.createMany({ data: taskRows });
  const laneCounts = taskRows.reduce<Record<string, number>>((acc, r) => {
    if (r.status !== 'DONE') acc[r.lane] = (acc[r.lane] ?? 0) + 1;
    return acc;
  }, {});
  log('created onboarding tasks', `${taskRows.length} for ${joiners.length} joiners`);
  log('outstanding by lane', Object.entries(laneCounts).map(([k, v]) => `${k}:${v}`).join(' '));

  // ══ e-resignation & clearance ══════════════════════════════════════
  section('E-resignation & clearance');

  const clearanceDepts: { id: number; name: string; checklist: string[] }[] = [];
  for (const [i, spec] of CLEARANCE_DEPARTMENTS_DEFAULT.entries()) {
    clearanceDepts.push(
      await prisma.clearanceDepartment.create({
        data: {
          companyId: org.primaryCompanyId,
          name: spec.name,
          checklist: spec.checklist,
          sortOrder: i,
        },
      }),
    );
  }
  log('created clearance departments', clearanceDepts.length);

  // A handful of resignations at different stages of the workflow.
  const resignationCandidates = org.employees.filter(
    (e) =>
      e.companyId === org.primaryCompanyId &&
      e.employmentStatus === 'PERMANENT' &&
      !['md', 'hr.admin', 'admin', 'payroll', 'manager', 'employee', 'field'].includes(e.username) &&
      e.lineManagerId !== null,
  );
  const resigning = pickN(resignationCandidates, 6);
  const stages = ['SUBMITTED', 'LM_APPROVAL', 'HR_APPROVAL', 'CLEARANCE', 'CLEARANCE', 'COMPLETED'] as const;

  const REASONS = [
    'Accepted an offer with a larger scope of responsibility.',
    'Relocating abroad with family for my spouse\'s work.',
    'Pursuing a full-time postgraduate programme.',
    'Personal and family reasons requiring a career break.',
    'Moving to a role closer to my home district.',
    'Career change into a different industry.',
  ];

  for (const [i, emp] of resigning.entries()) {
    const stage = stages[i];
    const isDone = stage === 'COMPLETED';

    // Submitted between 10 and 75 days ago; last working day derived from it.
    const submittedAt = addDays(TODAY, -randInt(10, 75));
    const required = emp.level >= 6 ? 90 : 30;
    // Some serve the full notice, some short-serve and get recovered.
    const servedDays = chance(65) ? required : randInt(10, required - 5);
    const lastWorkingDay = addDays(submittedAt, servedDays);
    const recoveryDays = Math.max(0, required - servedDays);

    const resignation = await prisma.resignation.create({
      data: {
        employeeId: emp.id,
        noticePeriodRequiredDays: required,
        submittedAt,
        lastWorkingDay,
        noticePeriodServedDays: servedDays,
        noticePeriodRecoveryDays: recoveryDays,
        dateOfSeparation: lastWorkingDay,
        reason: REASONS[i % REASONS.length],
        letterPath: `resignations/${emp.visibleId}/signed-resignation-letter.pdf`,
        stage,
        // Recovery is charged at the daily gross rate for un-served days.
        recoveryAmount: recoveryDays > 0 ? round2((emp.gross / 30) * recoveryDays) : null,
        finalSettlementAmount: isDone ? round2(emp.gross * randInt(1, 3) + randInt(0, 90) * 1_000) : null,
        completedAt: isDone ? addDays(lastWorkingDay, 7) : null,
      },
    });

    // Approval chain: line manager → HR → (MD for senior staff).
    const chain: { approverId: bigint; role: string }[] = [
      { approverId: emp.lineManagerId!, role: 'LINE_MANAGER' },
      { approverId: hrAdmin.id, role: 'HR' },
    ];
    if (emp.level >= 6) {
      const md = org.employees.find((e) => e.username === 'md')!;
      chain.push({ approverId: md.id, role: 'MD' });
    }

    const stageOrder = ['SUBMITTED', 'LM_APPROVAL', 'HR_APPROVAL', 'CLEARANCE', 'COMPLETED'];
    const stageIndex = stageOrder.indexOf(stage === 'CLEARANCE' ? 'CLEARANCE' : stage);

    await prisma.resignationApproval.createMany({
      data: chain.map((link, seq) => {
        // Approvals ahead of the current stage are still pending.
        const approved = stageIndex > seq + 1 || stage === 'CLEARANCE' || isDone;
        return {
          resignationId: resignation.id,
          approverId: link.approverId,
          role: link.role,
          seq,
          status: approved ? 'APPROVED' : 'PENDING',
          comment: approved
            ? pick([
                'Approved. Handover plan agreed with the team.',
                'Approved — sorry to see them go.',
                'Approved subject to completion of the knowledge transfer.',
              ])
            : null,
          decidedAt: approved ? addDays(submittedAt, seq + randInt(1, 4)) : null,
        };
      }),
    });

    // Clearance lines exist once the resignation reaches the clearance stage.
    if (['CLEARANCE', 'COMPLETED'].includes(stage)) {
      await prisma.clearanceItem.createMany({
        data: clearanceDepts.map((dept) => {
          const cleared = isDone || chance(55);
          return {
            resignationId: resignation.id,
            clearanceDepartmentId: dept.id,
            ownerId: dept.name.startsWith('IT') ? itAdmin.id
              : dept.name.startsWith('HR') ? hrAdmin.id
              : dept.name.startsWith('Line Manager') ? emp.lineManagerId
              : pick(org.employees.filter((e) => e.level >= 5)).id,
            status: cleared ? 'APPROVED' : 'PENDING',
            duesAmount: cleared && chance(30) ? round2(randInt(1, 40) * 500) : null,
            remarks: cleared ? 'All items verified and returned.' : null,
            checklistState: dept.checklist.map((item) => ({ item, returned: cleared })),
            clearedAt: cleared ? addDays(lastWorkingDay, randInt(-3, 6)) : null,
          };
        }),
      });
    }

    // Exit interview happens at the end.
    if (isDone) {
      await prisma.exitInterview.create({
        data: {
          resignationId: resignation.id,
          responses: EXIT_INTERVIEW_QUESTIONS.map((question) => ({
            question,
            answer: pick([
              'Largely positive — the team was supportive throughout.',
              'Growth opportunities were limited in my specific function.',
              'Compensation was fair but below the market for my experience.',
              'Manager support was excellent; workload was occasionally heavy.',
              'Would recommend the company to a friend.',
            ]),
            rating: randInt(3, 5),
          })),
          primaryReason: pick(['Career growth', 'Compensation', 'Relocation', 'Higher studies']),
          wouldRejoin: chance(70),
          npsScore: randInt(5, 10),
          conductedById: hrAdmin.id,
          conductedAt: addDays(lastWorkingDay, -2),
        },
      });
    }

    // A completed exit flips the employee record to separated.
    if (isDone) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          employmentStatus: 'SEPARATED',
          active: false,
          separationDate: lastWorkingDay,
          clearanceLetterPath: `resignations/${emp.visibleId}/clearance-letter.pdf`,
        },
      });
    }
  }
  log('created resignations', `${resigning.length} across stages: ${stages.join(', ')}`);
}
