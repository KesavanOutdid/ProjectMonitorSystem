'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../store/authStore';
import {
  X,
  Search,
  BookOpen,
  Sparkles,
  Layers,
  Kanban,
  CheckCircle2,
  Clock,
  GitGraph,
  HelpCircle,
  FileText,
  Users,
  Inbox,
  Calendar,
  BarChart3,
  ShieldCheck,
  Zap,
  ArrowRight,
  Flame,
  Bug,
  BookmarkCheck,
  CheckSquare,
  Compass,
  Lightbulb,
  Workflow,
  RotateCcw,
  Trash2,
  Shield,
  Crown,
  Lock,
  Unlock,
  AlertTriangle,
  PieChart,
  UserCheck
} from 'lucide-react';

interface HelpCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: string) => void;
}

export const HelpCenterModal: React.FC<HelpCenterModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab
}) => {
  const { user } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [activeCategory, setActiveCategory] = useState<'pages' | 'permissions' | 'scenarios' | 'glossary'>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');

  if (!isOpen) return null;

  // Current user's role
  const userRole = (user?.role || 'MEMBER').toUpperCase();

  // Pages & Views definitions with explicit RBAC permissions
  const pageGuides = [
    {
      id: 'dashboard',
      tabKey: 'dashboard',
      title: 'Workspace Executive Dashboard',
      badge: 'Portfolio Level',
      permission: 'All Roles (View)',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER', 'GUEST'],
      icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
      description: 'High-level project health matrix, company-wide sprint metrics, resource allocation, and burn-down analytics across all workspace projects.',
      keyFeatures: [
        'Live KPI tiles showing Total Projects, Active Sprints, Work in Progress (WIP), and Overdue alerts',
        'Company-wide Project Health Matrix with completion percentages and active sprint status',
        'Team workload distribution and active engineering contributors breakdown'
      ],
      bestFor: 'Engineering Directors, Executives, and Program Managers tracking cross-project health.'
    },
    {
      id: 'summary',
      tabKey: 'summary',
      title: 'Project Space Summary & Analytics',
      badge: 'Project Level',
      permission: 'All Members (Full), Guests (View)',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER', 'GUEST'],
      icon: <BarChart3 className="w-5 h-5 text-blue-500" />,
      description: 'Unified command center for a single project. Features live Burndown charts (Ideal vs Actual), an interactive Sprint Velocity Pie & Bar Chart switcher, work item distribution, and audit feeds.',
      keyFeatures: [
        'Interactive Sprint Velocity Donut / Pie Chart with real-time completion percentages and toggle to bar chart',
        'Mathematical Sprint Burndown Chart tracking ideal burn-down trajectory vs actual daily tasks remaining',
        'Specialized Engineering Teams progress snapshots (Hardware PCB, Firmware, Software, QA)',
        'Real-time Space activity audit stream of task status changes and comments'
      ],
      bestFor: 'Project Managers, Scrum Masters, and Engineers checking weekly delivery velocity.'
    },
    {
      id: 'recycle-bin',
      tabKey: 'recycle-bin',
      title: 'Recycle Bin & Data Retention Space',
      badge: 'Safety & Recovery',
      permission: 'Restore: Creator/PM/Admin • Purge: Admin Only',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER'],
      icon: <RotateCcw className="w-5 h-5 text-emerald-600" />,
      description: 'Enterprise 30-day quarantine for soft-deleted projects, tasks, and change requests. Protects your workspace against accidental loss with instant 1-click restore.',
      keyFeatures: [
        '30-Day automated retention countdown before permanent database cleanup',
        'One-click instant restoration preserving original sprint, board column, and assignments',
        'Role-guarded Permanent Purge to prevent unauthorized data destruction',
        'Multi-tab filtering across Deleted Projects, Tasks, and Engineering Change Requests'
      ],
      bestFor: 'All team members recovering deleted items; Admins managing workspace data retention.'
    },
    {
      id: 'teams',
      tabKey: 'teams',
      title: 'Teams & Discipline Progress Intelligence',
      badge: 'Team Level',
      permission: 'All Members (View), Leads (Manage)',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER'],
      icon: <Users className="w-5 h-5 text-emerald-500" />,
      description: 'Tracks delivery progress broken down by specialized discipline teams (e.g., Battery Systems, Hardware PCB, Firmware, Cloud Backend, QA Bench).',
      keyFeatures: [
        'Total, WIP (Work In Progress), Done, and Alert counts per discipline',
        'Assigned Team Lead with direct avatar and email contact',
        'Customizable discipline badge colors and responsibilities descriptions',
        'One-click filtering to isolate tasks belonging to a specific discipline'
      ],
      bestFor: 'Team Leads, Discipline Leads, and PMs balancing cross-functional hardware/software workloads.'
    },
    {
      id: 'board',
      tabKey: 'board',
      title: 'Agile Kanban & Sprint Board',
      badge: 'Execution',
      permission: 'All Members (Drag & Drop)',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER'],
      icon: <Kanban className="w-5 h-5 text-amber-500" />,
      description: 'Drag-and-drop interactive work board supporting custom workflow stages, live WebSockets sync, active sprint filters, and discipline team filtering.',
      keyFeatures: [
        'Drag & drop task cards across customizable columns (e.g. Backlog -> Schematics -> Bring-Up -> QA -> Done)',
        'Sprint switcher to view Active Sprint only or Planned Sprints',
        'Team avatar filters with task count badges',
        'Real-time WebSocket synchronization across all collaborators',
        'DAG Dependency quick modal to view blockers and dependency chains'
      ],
      bestFor: 'Developers, Hardware Engineers, QA Engineers, and Daily Standups.'
    },
    {
      id: 'backlog',
      tabKey: 'backlog',
      title: 'Sprint Planning & Backlog Management',
      badge: 'Planning',
      permission: 'Required: Team Lead, PM, or Admin',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD'],
      icon: <Layers className="w-5 h-5 text-purple-500" />,
      description: 'Comprehensive backlog grooming interface. Plan upcoming sprints, drag items from product backlog into active or future sprints, and estimate work.',
      keyFeatures: [
        'Create and start Sprints with start dates, end dates, and sprint goals',
        'Drag tasks between Backlog and Sprint containers',
        'Inline task creation directly within a specific sprint or backlog',
        'Story point / priority estimation and backlog grooming tools'
      ],
      bestFor: 'Sprint Planning meetings, Product Managers, and Project Managers.'
    },
    {
      id: 'requests',
      tabKey: 'requests',
      title: 'Engineering Change Requests (RFC)',
      badge: 'Governance',
      permission: 'Submit: All • Review/Approve: Lead & PM',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER'],
      icon: <Inbox className="w-5 h-5 text-rose-500" />,
      description: 'Formal hardware/software change control system. Submit Engineering Change Requests (ECR/RFC), review impacts, and approve or reject with audit trails.',
      keyFeatures: [
        'Structured change request submission with Reason, Impact Analysis, and Scope',
        'Reviewer assignment and approval / rejection workflow with comments',
        'Auto-convert approved change requests into actionable tasks in the sprint board'
      ],
      bestFor: 'Hardware design revisions, critical architectural shifts, and quality compliance.'
    },
    {
      id: 'dependencies',
      tabKey: 'board',
      title: 'DAG Dependency Graph (Blockers)',
      badge: 'Flow Control',
      permission: 'All Engineering Roles',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER'],
      icon: <GitGraph className="w-5 h-5 text-cyan-500" />,
      description: 'Interactive Directed Acyclic Graph (DAG) visualizing task dependencies, critical path, blocking work items, and downstream delays.',
      keyFeatures: [
        'Visual node-and-edge connection showing "Blocks" and "Blocked By"',
        'Red highlighted paths for tasks currently blocked by incomplete predecessor tasks',
        'Auto-validation to prevent circular dependencies'
      ],
      bestFor: 'Managing complex hardware-software dependencies where PCB fabrication must precede firmware bring-up.'
    },
    {
      id: 'docs',
      tabKey: 'docs',
      title: 'Engineering Specs & Docs Space',
      badge: 'Documentation',
      permission: 'All Members (Read/Write)',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER', 'TEAM_LEAD', 'DEVELOPER', 'QA', 'MEMBER'],
      icon: <FileText className="w-5 h-5 text-teal-500" />,
      description: 'Central repository for technical schematics, firmware registers, design documents, and user acceptance criteria.',
      keyFeatures: [
        'Document creation and organization with tags and versions',
        'Rich markdown documentation and architecture blueprints',
        'Direct linkage between spec documents and Kanban tasks'
      ],
      bestFor: 'Technical architecture, API documentation, and test criteria.'
    },
    {
      id: 'admin',
      tabKey: 'admin',
      title: 'Organization Admin & RBAC',
      badge: 'Administration',
      permission: 'Required: SuperAdmin or OrgAdmin',
      allowedRoles: ['SUPER_ADMIN', 'ORG_ADMIN'],
      icon: <ShieldCheck className="w-5 h-5 text-slate-700" />,
      description: 'Manage organization members, send secure email invitations, assign role permissions, and configure project access.',
      keyFeatures: [
        'Invite new members by email with preset role and project assignments',
        'Role-Based Access Control (RBAC): SuperAdmin, OrgAdmin, PM, Team Lead, Developer, QA, Designer, Member, Guest',
        'Member status toggling (Active, Invited, Suspended)'
      ],
      bestFor: 'Organization Owners and System Administrators.'
    }
  ];

  // RBAC Permission Matrix Rows
  const permissionMatrix = [
    {
      category: 'Workspace & Projects',
      items: [
        {
          action: 'Create New Project',
          description: 'Initialize a new project space, key, and default board columns',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Edit Project Settings & Teams',
          description: 'Modify project name, description, assigned team leads, and discipline groups',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: 'Partial',
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Soft Delete Project (Move to Recycle Bin)',
          description: 'Send project to 30-day quarantine bin without immediate data loss',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Permanently Purge Project',
          description: 'Irreversibly delete a project and all associated tasks from database',
          superAdmin: true,
          orgAdmin: true,
          pm: false,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        }
      ]
    },
    {
      category: 'Sprints & Backlog Planning',
      items: [
        {
          action: 'Create & Start Sprints',
          description: 'Define sprint goals, set start/end dates, and commit backlog items to execution',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Complete / Close Active Sprint',
          description: 'Finish sprint, record velocity data points, and rollover unfinished tasks',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Add Tasks to Backlog & Estimate Points',
          description: 'Create user stories, bugs, and tasks in product backlog and set story points',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: true,
          qa: true,
          member: true,
          guest: false
        }
      ]
    },
    {
      category: 'Tasks & Kanban Execution',
      items: [
        {
          action: 'Create & Assign Tasks',
          description: 'Create new tasks on Kanban board and assign to contributors',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: true,
          qa: true,
          member: true,
          guest: false
        },
        {
          action: 'Drag & Drop Task Status Columns',
          description: 'Transition task cards across Kanban columns (Backlog, WIP, Review, Done)',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: true,
          qa: true,
          member: true,
          guest: false
        },
        {
          action: 'Soft Delete Task (Move to Recycle Bin)',
          description: 'Move an unwanted or duplicate task into 30-day Recycle Bin quarantine',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: 'Own Tasks',
          qa: 'Own Tasks',
          member: 'Own Tasks',
          guest: false
        },
        {
          action: 'Permanently Purge Tasks',
          description: 'Permanently remove deleted tasks from Recycle Bin storage',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        }
      ]
    },
    {
      category: 'Change Requests (RFC / ECR) & Governance',
      items: [
        {
          action: 'Submit Change Request (RFC)',
          description: 'Propose critical hardware or software scope change with impact analysis',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: true,
          qa: true,
          member: true,
          guest: false
        },
        {
          action: 'Review & Approve / Reject RFC',
          description: 'Audit technical & budget impact and officially authorize change proposal',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Auto-Convert Approved RFC to Tasks',
          description: 'Transform accepted change request into actionable sprint tasks',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: false,
          qa: false,
          member: false,
          guest: false
        }
      ]
    },
    {
      category: 'Recycle Bin & Data Retention',
      items: [
        {
          action: 'Access Recycle Bin View',
          description: 'Inspect soft-deleted projects, tasks, and change requests in quarantine',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: true,
          qa: true,
          member: true,
          guest: false
        },
        {
          action: 'Restore Item from Recycle Bin',
          description: 'Instantly restore soft-deleted items back to their active board & sprint',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: true,
          developer: 'Own Items',
          qa: 'Own Items',
          member: 'Own Items',
          guest: false
        },
        {
          action: 'Empty Bin / Purge Expired Items',
          description: 'Force immediate permanent deletion of quarantined items before 30 days',
          superAdmin: true,
          orgAdmin: true,
          pm: true,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        }
      ]
    },
    {
      category: 'Organization & Member Administration',
      items: [
        {
          action: 'Invite New Members & Assign Roles',
          description: 'Send invitation emails and assign RBAC roles & project memberships',
          superAdmin: true,
          orgAdmin: true,
          pm: false,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Modify User Roles or Suspend Users',
          description: 'Change user role (e.g. Developer -> Lead) or toggle active/suspended status',
          superAdmin: true,
          orgAdmin: true,
          pm: false,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        },
        {
          action: 'Manage Subscription & Invoices',
          description: 'Upgrade plan, view workspace license seats, and process billing',
          superAdmin: true,
          orgAdmin: true,
          pm: false,
          teamLead: false,
          developer: false,
          qa: false,
          member: false,
          guest: false
        }
      ]
    }
  ];

  // Scenario Walkthroughs
  const scenarios = [
    {
      title: 'Scenario 1: Starting a New Project & Sprint Planning',
      role: 'Project Manager (PM) / Product Owner',
      requiredRole: 'PROJECT_MANAGER or ORG_ADMIN',
      steps: [
        {
          num: 1,
          name: 'Create the Project',
          desc: 'Click "+ New Project" in the sidebar. Enter project name (e.g., "Smart Energy Monitor"), project key ("SEM"), and optional team discipline presets.'
        },
        {
          num: 2,
          name: 'Invite Team & Assign Roles',
          desc: 'Go to Admin Panel -> Invite New. Enter emails for Hardware Leads, Firmware Devs, and QA. Assign appropriate roles and associate them with the new project.'
        },
        {
          num: 3,
          name: 'Groom the Backlog',
          desc: 'Go to Backlog tab. Click "+ Create Task" to enter user stories, hardware component sourcing tasks, and firmware tasks. Group tasks by Epic or Labels.'
        },
        {
          num: 4,
          name: 'Create & Start Sprint 1',
          desc: 'Click "+ Create Sprint". Define Sprint Goal (e.g. "PCB v1.0 Schematics & Microcontroller Bring-Up") and date range. Drag tasks into Sprint 1 and click "Start Sprint".'
        }
      ]
    },
    {
      title: 'Scenario 2: Hardware & Software Execution in Daily Sprints',
      role: 'Hardware Engineer / Software Developer / QA',
      requiredRole: 'DEVELOPER, QA, or MEMBER',
      steps: [
        {
          num: 1,
          name: 'Select Your Discipline Team Filter',
          desc: 'On the Kanban Board, select your team filter (e.g. "Hardware & PCB"). Only tasks relevant to your discipline will be shown.'
        },
        {
          num: 2,
          name: 'Pick Up a Task from Backlog / Idea',
          desc: 'Drag your assigned task from Column 1 ("Idea / Backlog") into Column 2 ("Schematics / WIP"). The system automatically updates the Team WIP count.'
        },
        {
          num: 3,
          name: 'Log Time & Add Subtasks',
          desc: 'Click on the task card to open the Task Modal. Check subtasks, log actual work time in the "Work Log" tab, and add comments or attachments.'
        },
        {
          num: 4,
          name: 'Move to Review & Done',
          desc: 'Once the schematic or code is ready, drag it to "Testing / Review". When verified by QA, move it to the final column ("Done").'
        }
      ]
    },
    {
      title: 'Scenario 3: Handling Critical Hardware Design Changes (RFC)',
      role: 'Lead Architect / Hardware Engineer / PM',
      requiredRole: 'Any Member (Submit), Lead/PM (Approve)',
      steps: [
        {
          num: 1,
          name: 'Submit a Change Request',
          desc: 'Go to "Change Requests" tab -> Click "+ Submit Request". Detail why the change is needed (e.g. "MCU IC Discontinued -> Switch to STM32H7") and impact analysis.'
        },
        {
          num: 2,
          name: 'Assign Reviewers',
          desc: 'Assign the Project Manager or Lead Architect as the accepting reviewer.'
        },
        {
          num: 3,
          name: 'Review & Approval',
          desc: 'The Reviewer receives the request, inspects cost/schedule impacts, and clicks "Approve".'
        },
        {
          num: 4,
          name: 'Auto-Task Generation',
          desc: 'The approved change request automatically converts into a high-priority task in the active sprint backlog.'
        }
      ]
    },
    {
      title: 'Scenario 4: Managing Task Blockers with DAG Dependencies',
      role: 'Cross-functional Team Lead',
      requiredRole: 'TEAM_LEAD or PM',
      steps: [
        {
          num: 1,
          name: 'Link Dependent Tasks',
          desc: 'Open Task Modal -> In the sidebar, click "Link Issue". Select "Blocks" or "is Blocked By" and choose the predecessor task (e.g., "Firmware Bring-Up is Blocked By PCB Delivery").'
        },
        {
          num: 2,
          name: 'Inspect Dependency Graph',
          desc: 'Click "Dependencies (DAG)" at the top right of the Kanban Board. View the visual graph to spot bottlenecks and critical paths.'
        },
        {
          num: 3,
          name: 'Automatic Unblocking',
          desc: 'When the predecessor task is moved to "Done", the blocker badge on the downstream task turns green and notifies the assignee to begin.'
        }
      ]
    },
    {
      title: 'Scenario 5: Soft-Deleting & Restoring Items via the Recycle Bin',
      role: 'All Contributors & Administrators',
      requiredRole: 'All Roles (Creator/PM/Admin to Restore)',
      steps: [
        {
          num: 1,
          name: 'Safely Soft-Delete an Item',
          desc: 'When a task, project, or change request is cancelled or duplicated, click "Delete". It is placed into 30-day quarantine without permanent loss.'
        },
        {
          num: 2,
          name: 'Open the Recycle Bin',
          desc: 'Click "Recycle Bin" in the sidebar navigation or from the project dropdown menu to inspect quarantined items.'
        },
        {
          num: 3,
          name: 'Inspect 30-Day Retention Timer',
          desc: 'Each quarantined card shows exact days remaining before permanent cleanup, along with who deleted it and timestamp.'
        },
        {
          num: 4,
          name: 'One-Click Instant Restore',
          desc: 'Click "Restore". The item is instantly restored to its active project, original sprint, and Kanban stage with full history.'
        }
      ]
    }
  ];

  // Glossary Terms
  const glossary = [
    {
      term: 'Recycle Bin & 30-Day Retention',
      category: 'Data Governance',
      definition: 'A secure quarantine space where deleted projects, tasks, and change requests are held for 30 days before automated purging. Allows instant recovery and prevents accidental loss.'
    },
    {
      term: 'Sprint Velocity Chart (Pie & Bar)',
      category: 'Scrum & Analytics',
      definition: 'Visualizes committed vs. completed tasks for sprints. In Pie Chart mode, it shows a clear donut breakdown of completion percentage; in Bar Chart mode, it compares multi-sprint history.'
    },
    {
      term: 'Sprint Burndown Chart',
      category: 'Scrum & Analytics',
      definition: 'Mathematical chart displaying ideal daily task burn-down trajectory vs. actual tasks remaining across the sprint calendar duration.'
    },
    {
      term: 'WIP (Work In Progress)',
      category: 'Agile & Kanban',
      definition: 'The number of tasks that are currently actively being worked on (in any intermediate stage between Initial and Done). Keeping WIP balanced prevents developer burnout and exposes engineering bottlenecks.'
    },
    {
      term: 'Sprint',
      category: 'Scrum',
      definition: 'A fixed time-box (typically 1 to 3 weeks) during which the engineering team commits to completing a specific set of deliverables and goals.'
    },
    {
      term: 'Workflow Stages / Columns',
      category: 'Board Customization',
      definition: 'The progression pipeline of a board. Position 1 (index 0) represents Idea/Backlog (Not Started), the last position represents Completed/Done, and all middle positions represent WIP.'
    },
    {
      term: 'Epic',
      category: 'Hierarchy',
      definition: 'A large body of work that can be broken down into smaller Stories and Tasks (e.g., "v2.0 Battery Management System Overhaul").'
    },
    {
      term: 'Story vs Task vs Bug',
      category: 'Work Types',
      definition: '• Story: A user or functional feature deliverable.\n• Task: A technical work item (e.g. PCB layout, API route creation).\n• Bug: A defect, error, or hardware fault needing resolution.'
    },
    {
      term: 'DAG (Directed Acyclic Graph)',
      category: 'Dependencies',
      definition: 'A mathematical model representing task prerequisites where tasks flow forward without circular loops. If Task B depends on Task A, Task B cannot start until Task A is completed.'
    },
    {
      term: 'Discipline / Team Lead',
      category: 'Organization',
      definition: 'Specialized functional group (e.g., Mechanical CAD, Power Electronics, Firmware) led by an assigned Team Lead responsible for task completion and code quality.'
    },
    {
      term: 'Change Request (RFC / ECR)',
      category: 'Governance',
      definition: 'A formal Request For Change used in hardware and systems engineering to evaluate scope, bill of materials (BOM), and timeline impacts before altering active project scope.'
    },
    {
      term: 'Work Log & Time Tracking',
      category: 'Reporting',
      definition: 'Time spent in minutes/hours logged by team members against tasks to measure real engineering effort against planned estimates.'
    }
  ];

  // Filtering
  const filteredGuides = pageGuides.filter((g) => {
    const matchesSearch =
      g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.badge.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.permission.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const filteredGlossary = glossary.filter(
    (g) =>
      g.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.definition.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredScenarios = scenarios.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.steps.some(
        (st) =>
          st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          st.desc.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  const filteredMatrix = permissionMatrix.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) =>
        item.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter((cat) => cat.items.length > 0);

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#0F172A]/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in select-none">
      <div className="bg-white w-full max-w-5xl h-[92vh] rounded-3xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-[#111827] my-auto">
        {/* Top Header Banner */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#22C55E] to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-[#22C55E]/20">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base sm:text-lg font-black tracking-tight">
                  Outdid Sync • System Help & User Guide
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Interactive Guide
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Comprehensive manual, role permissions matrix (RBAC), and workflows.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Current User Role Indicator */}
            <div className="hidden sm:flex items-center gap-2 bg-white/10 border border-white/15 px-3 py-1.5 rounded-xl text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div className="flex flex-col text-left">
                <span className="text-[9px] uppercase tracking-wider text-slate-300 font-bold leading-none">Your Role</span>
                <span className="text-[11px] font-extrabold text-white leading-tight">{userRole}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Close Help Center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar & Category Navigation */}
        <div className="px-6 py-3 bg-[#F8FAFC] border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveCategory('pages')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'pages'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A] hover:bg-slate-200/60'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Pages & Features ({pageGuides.length})</span>
            </button>

            <button
              onClick={() => setActiveCategory('permissions')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'permissions'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Roles & Permissions (RBAC)</span>
            </button>

            <button
              onClick={() => setActiveCategory('scenarios')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'scenarios'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A] hover:bg-slate-200/60'
              }`}
            >
              <Workflow className="w-4 h-4" />
              <span>Example Scenarios ({scenarios.length})</span>
            </button>

            <button
              onClick={() => setActiveCategory('glossary')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeCategory === 'glossary'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-[#0F172A] hover:bg-slate-200/60'
              }`}
            >
              <Lightbulb className="w-4 h-4" />
              <span>Glossary of Terms ({glossary.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search help topics or permissions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-600 font-semibold text-[#111827] shadow-xs"
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* CATEGORY 1: PAGES & FEATURES */}
          {activeCategory === 'pages' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGuides.map((guide) => {
                const userHasAccess = guide.allowedRoles.includes(userRole);

                return (
                  <div
                    key={guide.id}
                    className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs hover:border-slate-400 hover:shadow-sm transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                            {guide.icon}
                          </div>
                          <div>
                            <h4 className="font-extrabold text-sm text-[#111827]">{guide.title}</h4>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {guide.badge}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                userHasAccess
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {guide.permission}
                              </span>
                            </div>
                          </div>
                        </div>

                        {onNavigateTab && (
                          <button
                            onClick={() => {
                              onNavigateTab(guide.tabKey);
                              onClose();
                            }}
                            className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-all cursor-pointer shrink-0"
                          >
                            <span>Open View</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 font-medium mb-3 mt-1 leading-relaxed">
                        {guide.description}
                      </p>

                      <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100 mb-3">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-1.5">
                          Key Capabilities:
                        </span>
                        <ul className="space-y-1.5">
                          {guide.keyFeatures.map((feat, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 font-semibold pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-[#0F172A] font-bold">Best For:</span>
                        <span className="truncate max-w-[280px]">{guide.bestFor}</span>
                      </div>
                      <span className={`text-[10px] font-bold shrink-0 ${userHasAccess ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {userHasAccess ? '✓ You Have Access' : '⚠ Restricted'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CATEGORY 2: ROLES & PERMISSIONS MATRIX (RBAC) */}
          {activeCategory === 'permissions' && (
            <div className="space-y-5">
              {/* Permissions Intro & Role Filter */}
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <span>Role-Based Access Control (RBAC) Specification</span>
                    </h4>
                    <p className="text-xs text-blue-200 mt-1 max-w-2xl leading-relaxed">
                      Every feature in Outdid Sync is strictly guarded across both client UI and server APIs.
                      Admins hold full governance, Leads manage sprints, and Members execute tasks.
                    </p>
                  </div>

                  {/* Highlight current user role */}
                  <div className="bg-white/10 border border-white/20 px-3.5 py-2 rounded-xl text-xs shrink-0 self-start sm:self-center">
                    <span className="text-[10px] uppercase font-bold text-blue-300 block">Logged-in Account</span>
                    <span className="font-extrabold text-white text-sm">{user?.name || 'Current User'} ({userRole})</span>
                  </div>
                </div>

                {/* Role Filter Chips */}
                <div className="mt-4 pt-3 border-t border-white/15 flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider shrink-0">Filter By Role:</span>
                  {[
                    { key: 'ALL', label: 'All Roles' },
                    { key: 'SUPER_ADMIN', label: 'Super Admin' },
                    { key: 'ORG_ADMIN', label: 'Org Admin' },
                    { key: 'PROJECT_MANAGER', label: 'Project Manager' },
                    { key: 'TEAM_LEAD', label: 'Team Lead' },
                    { key: 'DEVELOPER', label: 'Developer / Engineer' },
                    { key: 'QA', label: 'QA Engineer' },
                    { key: 'MEMBER', label: 'Member' },
                    { key: 'GUEST', label: 'Guest' }
                  ].map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setSelectedRoleFilter(r.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        selectedRoleFilter === r.key
                          ? 'bg-white text-blue-900 shadow-xs'
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Matrix Sections */}
              {filteredMatrix.map((section, sIdx) => (
                <div key={sIdx} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="px-5 py-3 bg-slate-100 border-b border-gray-200 flex items-center justify-between">
                    <h5 className="font-extrabold text-sm text-[#0F172A] flex items-center gap-2">
                      <Crown className="w-4 h-4 text-purple-600" />
                      <span>{section.category}</span>
                    </h5>
                    <span className="text-[11px] font-bold text-slate-500">
                      {section.items.length} permission rules
                    </span>
                  </div>

                  <div className="divide-y divide-gray-100 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 border-b border-gray-100">
                          <th className="py-2.5 px-4 w-1/3">Action / Capability</th>
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'SUPER_ADMIN') && (
                            <th className="py-2.5 px-3 text-center">Super Admin</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'ORG_ADMIN') && (
                            <th className="py-2.5 px-3 text-center">Org Admin</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'PROJECT_MANAGER') && (
                            <th className="py-2.5 px-3 text-center">Project Mgr</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'TEAM_LEAD') && (
                            <th className="py-2.5 px-3 text-center">Team Lead</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'DEVELOPER') && (
                            <th className="py-2.5 px-3 text-center">Developer</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'QA') && (
                            <th className="py-2.5 px-3 text-center">QA</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'MEMBER') && (
                            <th className="py-2.5 px-3 text-center">Member</th>
                          )}
                          {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'GUEST') && (
                            <th className="py-2.5 px-3 text-center">Guest</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {section.items.map((item, iIdx) => {
                          const renderCell = (val: boolean | string) => {
                            if (val === true) {
                              return (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 font-bold" title="Allowed">
                                  ✓
                                </span>
                              );
                            }
                            if (val === false) {
                              return (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-50 text-slate-300 font-bold" title="Not Allowed">
                                  —
                                </span>
                              );
                            }
                            return (
                              <span className="inline-block text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 whitespace-nowrap">
                                {val}
                              </span>
                            );
                          };

                          return (
                            <tr key={iIdx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900 text-xs">{item.action}</div>
                                <div className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">
                                  {item.description}
                                </div>
                              </td>

                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'SUPER_ADMIN') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.superAdmin)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'ORG_ADMIN') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.orgAdmin)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'PROJECT_MANAGER') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.pm)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'TEAM_LEAD') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.teamLead)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'DEVELOPER') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.developer)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'QA') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.qa)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'MEMBER') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.member)}</td>
                              )}
                              {(selectedRoleFilter === 'ALL' || selectedRoleFilter === 'GUEST') && (
                                <td className="py-3 px-3 text-center">{renderCell(item.guest)}</td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CATEGORY 3: EXAMPLE SCENARIOS */}
          {activeCategory === 'scenarios' && (
            <div className="space-y-5">
              {filteredScenarios.map((scen, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-gray-100 gap-2">
                    <div>
                      <h4 className="text-sm sm:text-base font-extrabold text-[#111827] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <span>{scen.title}</span>
                      </h4>
                      <div className="text-xs font-bold text-slate-500 mt-0.5">
                        Primary Role: <span className="text-[#0F172A] font-extrabold">{scen.role}</span>
                      </div>
                    </div>

                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full shrink-0">
                      Required: {scen.requiredRole}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {scen.steps.map((st) => (
                      <div
                        key={st.num}
                        className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="w-6 h-6 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-black text-xs shrink-0">
                              {st.num}
                            </span>
                            <span className="text-xs font-bold text-[#111827] leading-snug">{st.name}</span>
                          </div>
                          <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                            {st.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CATEGORY 4: GLOSSARY OF TERMS */}
          {activeCategory === 'glossary' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredGlossary.map((item, idx) => (
                <div key={idx} className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <h5 className="font-extrabold text-sm text-[#0F172A] flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{item.term}</span>
                    </h5>
                    <span className="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium leading-relaxed whitespace-pre-line">
                    {item.definition}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-gray-200 flex items-center justify-between text-xs text-slate-500 font-semibold shrink-0">
          <span>Outdid Sync Documentation • Hardware & Software Project Intelligence</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0F172A] hover:bg-slate-800 text-white rounded-xl font-bold transition-all cursor-pointer shadow-xs"
          >
            Got It, Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
