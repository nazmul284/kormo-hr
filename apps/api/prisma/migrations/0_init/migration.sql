-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PERMANENT', 'PROBATION', 'CONTRACT', 'INTERN', 'SEPARATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('MANAGEMENT', 'STAFF', 'WORKER');

-- CreateEnum
CREATE TYPE "PayrollType" AS ENUM ('SALARIED', 'HOURLY');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "AddressKind" AS ENUM ('PRESENT', 'PERMANENT');

-- CreateEnum
CREATE TYPE "SalaryChangeStatus" AS ENUM ('JOINING', 'INCREMENT', 'PROMOTION', 'DEMOTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'WEEKEND', 'CONDITIONAL_WEEKEND', 'HOLIDAY', 'LEAVE', 'AFL', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveDayPart" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');

-- CreateEnum
CREATE TYPE "GenderRestriction" AS ENUM ('NONE', 'MALE_ONLY', 'FEMALE_ONLY');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW', 'APPROVED', 'PAID', 'LOCKED');

-- CreateEnum
CREATE TYPE "SalaryComponentCalc" AS ENUM ('PCT_OF_GROSS', 'PCT_OF_BASIC', 'FIXED', 'FORMULA');

-- CreateEnum
CREATE TYPE "TaxpayerCategory" AS ENUM ('GENERAL', 'FEMALE', 'SENIOR_CITIZEN', 'DISABLED', 'GAZETTED_FREEDOM_FIGHTER', 'THIRD_GENDER');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUBMITTED', 'IN_REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewStage" AS ENUM ('SELF_ASSESSMENT', 'MANAGER_REVIEW', 'HR_REVIEW', 'CALIBRATION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ConfirmationDecision" AS ENUM ('PENDING', 'CONFIRMED', 'EXTENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "OnboardingLane" AS ENUM ('EMPLOYEE', 'HR', 'IT', 'MANAGER');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ResignationStage" AS ENUM ('DRAFT', 'SUBMITTED', 'LM_APPROVAL', 'HR_APPROVAL', 'CLEARANCE', 'COMPLETED', 'WITHDRAWN', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'PENDING');

-- CreateEnum
CREATE TYPE "MealStatus" AS ENUM ('SCHEDULED', 'TAKEN', 'CANCELLED', 'NOT_TAKEN');

-- CreateEnum
CREATE TYPE "TrackingSessionStatus" AS ENUM ('ONGOING', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ContactLevel" AS ENUM ('A_PLUS', 'A', 'B', 'C', 'D');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('QUEUED', 'RUNNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('LEAVE', 'ATTENDANCE', 'PAYROLL', 'PERFORMANCE', 'ONBOARDING', 'RESIGNATION', 'BOOKING', 'ANNOUNCEMENT', 'APPROVAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "HelpdeskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "HelpdeskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "company" (
    "company_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "legal_name" TEXT,
    "logo_path" TEXT,
    "tin" TEXT,
    "bin" TEXT,
    "address" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 7,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "company_feature" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "location_id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geofence_m" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pkey" PRIMARY KEY ("location_id")
);

-- CreateTable
CREATE TABLE "department" (
    "department_id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parent_department_id" INTEGER,
    "head_employee_id" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_pkey" PRIMARY KEY ("department_id")
);

-- CreateTable
CREATE TABLE "designation" (
    "designation_id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "designation_pkey" PRIMARY KEY ("designation_id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_role" (
    "employee_id" BIGINT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_role_pkey" PRIMARY KEY ("employee_id","role_id")
);

-- CreateTable
CREATE TABLE "employee_company_access" (
    "employee_id" BIGINT NOT NULL,
    "company_id" INTEGER NOT NULL,

    CONSTRAINT "employee_company_access_pkey" PRIMARY KEY ("employee_id","company_id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" TEXT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" TEXT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "employee_id" BIGSERIAL NOT NULL,
    "employee_visible_id" TEXT NOT NULL,
    "unique_tag" TEXT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "alias_name" TEXT,
    "email" TEXT NOT NULL,
    "official_email" TEXT,
    "personal_email" TEXT,
    "alternate_email" TEXT,
    "official_contact" TEXT,
    "alternate_number" TEXT,
    "father_name" TEXT,
    "mother_name" TEXT,
    "birth_date" DATE,
    "actual_birth_date" DATE,
    "gender" "Gender",
    "nationality" TEXT DEFAULT 'Bangladeshi',
    "country_of_birth" TEXT,
    "religion" TEXT,
    "marital_status" "MaritalStatus",
    "blood_group" "BloodGroup",
    "spouse_name" TEXT,
    "spouse_date_of_birth" DATE,
    "nid_number" TEXT,
    "tin_number" TEXT,
    "passport_no" TEXT,
    "driving_license_no" TEXT,
    "rfid" TEXT,
    "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION',
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'STAFF',
    "payroll_type" "PayrollType" NOT NULL DEFAULT 'SALARIED',
    "joining_date" DATE NOT NULL,
    "probation_start_date" DATE,
    "confirmation_date" DATE,
    "contract_end_date" DATE,
    "notice_period_days" INTEGER NOT NULL DEFAULT 30,
    "separation_date" DATE,
    "company_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "department_id" INTEGER,
    "designation_id" INTEGER,
    "line_manager_id" BIGINT,
    "dotted_manager_1_id" BIGINT,
    "dotted_manager_2_id" BIGINT,
    "team_leader_id" BIGINT,
    "head_of_department_id" BIGINT,
    "project_manager_id" BIGINT,
    "referring_employee_id" BIGINT,
    "is_line_manager" BOOLEAN NOT NULL DEFAULT false,
    "is_team_leader" BOOLEAN NOT NULL DEFAULT false,
    "is_head_of_department" BOOLEAN NOT NULL DEFAULT false,
    "profile_pic_path" TEXT,
    "thumbnails_path_01" TEXT,
    "thumbnails_path_02" TEXT,
    "cv_path" TEXT,
    "nid_pass_path" TEXT,
    "offer_letter_path" TEXT,
    "appointment_letter" TEXT,
    "aggrement_letter_path" TEXT,
    "clearance_letter_path" TEXT,
    "attendance_roaster_id" INTEGER,
    "leave_policy_id" INTEGER,
    "carry_leave_policy_id" INTEGER,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "employee_address" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kind" "AddressKind" NOT NULL,
    "village" TEXT,
    "building_no" TEXT,
    "street_no" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "country" TEXT DEFAULT 'Bangladesh',

    CONSTRAINT "employee_address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_emergency" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_emergency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_nominee" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "share_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "nid" TEXT,
    "phone" TEXT,
    "date_of_birth" DATE,
    "address" TEXT,

    CONSTRAINT "employee_nominee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_education" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "degree" TEXT NOT NULL,
    "institute" TEXT NOT NULL,
    "major" TEXT,
    "result" TEXT,
    "passing_year" INTEGER,
    "is_highest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employee_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_experience" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "company_name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "responsibilities" TEXT,

    CONSTRAINT "employee_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_document" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATE,

    CONSTRAINT "employee_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_change_request" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "field_path" TEXT NOT NULL,
    "current_value" TEXT,
    "requested_value" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" BIGINT,
    "review_note" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "profile_change_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_update_config" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "employee_id" BIGINT,
    "allowed_fields" TEXT[],
    "auto_approve" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_update_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch_name" TEXT,
    "account_no" TEXT NOT NULL,
    "account_name" TEXT,
    "routing_no" TEXT,
    "txn_type" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_benefit" (
    "employee_id" BIGINT NOT NULL,
    "is_transport_user" BOOLEAN NOT NULL DEFAULT false,
    "is_tax_applicable" BOOLEAN NOT NULL DEFAULT true,
    "advance_income_tax" BOOLEAN NOT NULL DEFAULT false,
    "has_investment" BOOLEAN NOT NULL DEFAULT false,
    "has_provident_fund" BOOLEAN NOT NULL DEFAULT false,
    "has_lfa" BOOLEAN NOT NULL DEFAULT false,
    "has_gratuity" BOOLEAN NOT NULL DEFAULT false,
    "has_dormitory" BOOLEAN NOT NULL DEFAULT false,
    "has_bonus" BOOLEAN NOT NULL DEFAULT true,
    "has_life_insurance" BOOLEAN NOT NULL DEFAULT false,
    "has_lunch_allowance" BOOLEAN NOT NULL DEFAULT false,
    "has_medical_insurance" BOOLEAN NOT NULL DEFAULT false,
    "has_mobile_allowance" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_benefit_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "salary_history" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "basic" DECIMAL(14,2) NOT NULL,
    "house_rent" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "conveyance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "medical" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "increment_amount" DECIMAL(14,2),
    "increment_pct" DECIMAL(6,2),
    "allowances" JSONB,
    "status" "SalaryChangeStatus" NOT NULL DEFAULT 'JOINING',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_history" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "designation_id" INTEGER,
    "department_id" INTEGER,
    "company_id" INTEGER,
    "from_designation" TEXT,
    "status" "SalaryChangeStatus" NOT NULL DEFAULT 'PROMOTION',
    "remarks" TEXT,

    CONSTRAINT "promotion_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_component" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calc_type" "SalaryComponentCalc" NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_earning" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "salary_component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift" (
    "shift_id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "break_minutes" INTEGER NOT NULL DEFAULT 60,
    "is_night_shift" BOOLEAN NOT NULL DEFAULT false,
    "full_day_minutes" INTEGER NOT NULL DEFAULT 480,
    "half_day_minutes" INTEGER NOT NULL DEFAULT 240,
    "color_hex" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "shift_pkey" PRIMARY KEY ("shift_id")
);

-- CreateTable
CREATE TABLE "attendance_roster" (
    "roster_id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rotation_pattern" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "attendance_roster_pkey" PRIMARY KEY ("roster_id")
);

-- CreateTable
CREATE TABLE "roster_assignment" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "roster_id" INTEGER,
    "date" DATE NOT NULL,
    "shift_id" INTEGER,
    "is_weekend" BOOLEAN NOT NULL DEFAULT false,
    "is_conditional_weekend" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roster_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "employee_visible_id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "date" DATE NOT NULL,
    "in_time" TIMESTAMP(3),
    "out_time" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL,
    "late_time_minutes" INTEGER NOT NULL DEFAULT 0,
    "break_time_minutes" INTEGER NOT NULL DEFAULT 0,
    "total_work_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_time_in_seconds" INTEGER NOT NULL DEFAULT 0,
    "extra_ot_time_in_seconds" INTEGER NOT NULL DEFAULT 0,
    "attendance_roster_shift_name" TEXT,
    "attendance_roaster_start_time" TEXT,
    "attendance_roaster_end_time" TEXT,
    "attendance_roaster_late_time" TEXT,
    "is_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_in_time_edited" BOOLEAN NOT NULL DEFAULT false,
    "is_out_time_edited" BOOLEAN NOT NULL DEFAULT false,
    "updated_in_time" TIMESTAMP(3),
    "updated_out_time" TIMESTAMP(3),
    "updated_status" "AttendanceStatus",
    "send_edit_request" BOOLEAN NOT NULL DEFAULT false,
    "edit_reason" TEXT,
    "is_accepted_by_lm" BOOLEAN NOT NULL DEFAULT false,
    "is_rejected_by_lm" BOOLEAN NOT NULL DEFAULT false,
    "sending_date" TIMESTAMP(3),
    "accepted_date" TIMESTAMP(3),
    "rejected_date" TIMESTAMP(3),
    "action_overriden_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "allowed_for_overriding_request_action" BOOLEAN NOT NULL DEFAULT true,
    "compensation_leave_applicable" BOOLEAN NOT NULL DEFAULT false,
    "attendance_additional_info" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_time" (
    "id" BIGSERIAL NOT NULL,
    "attendance_id" BIGINT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "break_time_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_edit_request" (
    "id" BIGSERIAL NOT NULL,
    "attendance_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "requested_in_time" TIMESTAMP(3),
    "requested_out_time" TIMESTAMP(3),
    "requested_status" "AttendanceStatus",
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" BIGINT,
    "decision_note" TEXT,
    "overridden_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "attendance_edit_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_request" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "from_time" TEXT NOT NULL,
    "to_time" TEXT NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" BIGINT,
    "decision_note" TEXT,
    "payroll_run_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "overtime_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compensation_request" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "worked_date" DATE NOT NULL,
    "requested_off_date" DATE,
    "days" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" BIGINT,
    "decision_note" TEXT,
    "expires_at" DATE,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "compensation_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_exchange_request" (
    "id" BIGSERIAL NOT NULL,
    "requester_id" BIGINT NOT NULL,
    "counterparty_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "counterparty_date" DATE NOT NULL,
    "from_shift_id" INTEGER,
    "to_shift_id" INTEGER,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "counterparty_accepted" BOOLEAN NOT NULL DEFAULT false,
    "approver_id" BIGINT,
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "shift_exchange_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color_hex" TEXT NOT NULL,
    "default_count" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "is_pro_rated" BOOLEAN NOT NULL DEFAULT true,
    "is_carry_forwardable" BOOLEAN NOT NULL DEFAULT false,
    "max_carry_forward" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "requires_document" BOOLEAN NOT NULL DEFAULT false,
    "gender_restriction" "GenderRestriction" NOT NULL DEFAULT 'NONE',
    "max_consecutive_days" INTEGER NOT NULL DEFAULT 0,
    "min_notice_days" INTEGER NOT NULL DEFAULT 0,
    "counts_holidays" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policy" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "effective_year" INTEGER NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policy_line" (
    "id" SERIAL NOT NULL,
    "leave_policy_id" INTEGER NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "entitled_count" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "leave_policy_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "actual_leave_count" DECIMAL(6,2) NOT NULL,
    "remaining_leave_count" DECIMAL(6,2) NOT NULL,
    "consumed_count" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "pending_count" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carried_forward" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "leave_days" DECIMAL(5,2) NOT NULL,
    "calendar_days" INTEGER NOT NULL,
    "day_part" "LeaveDayPart" NOT NULL DEFAULT 'FULL_DAY',
    "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(255) NOT NULL,
    "applied_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" BIGINT,
    "approved_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "document_path" TEXT,
    "contact_while_away" TEXT,
    "handover_to_id" BIGINT,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_carry_forward" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "leave_type_id" INTEGER NOT NULL,
    "from_year" INTEGER NOT NULL,
    "to_year" INTEGER NOT NULL,
    "eligible_days" DECIMAL(6,2) NOT NULL,
    "carried_days" DECIMAL(6,2) NOT NULL,
    "lapsed_days" DECIMAL(6,2) NOT NULL,
    "expires_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_carry_forward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "duration" INTEGER NOT NULL,
    "description" TEXT,
    "year" INTEGER NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "religion" TEXT,

    CONSTRAINT "holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_run" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "salary_date" DATE,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "total_gross" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_net" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_tax" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip" (
    "id" BIGSERIAL NOT NULL,
    "payroll_run_id" INTEGER NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "salary_date" DATE NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "basic_allowance" DECIMAL(14,2) NOT NULL,
    "conveyance_allowance_medical" DECIMAL(14,2) NOT NULL,
    "transport_allowance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mobile_bill" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "overtime_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_earnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "provident_fund" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deduction_for_absence" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loan_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_payable" DECIMAL(14,2) NOT NULL,
    "breakdown" JSONB,
    "payslip_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_config" (
    "id" SERIAL NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'BD',
    "fiscal_year" TEXT NOT NULL,
    "category" "TaxpayerCategory" NOT NULL DEFAULT 'GENERAL',
    "non_taxable_divisor" DECIMAL(8,4) NOT NULL DEFAULT 3,
    "non_taxable_cap" DECIMAL(14,2) NOT NULL,
    "investment_allowance_pct" DECIMAL(6,3) NOT NULL DEFAULT 20,
    "rebate_pct" DECIMAL(6,3) NOT NULL DEFAULT 10,
    "minimum_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "surcharge_rules" JSONB,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,

    CONSTRAINT "tax_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_slab" (
    "id" SERIAL NOT NULL,
    "tax_config_id" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "slab_amount" DECIMAL(14,2),
    "rate" DECIMAL(6,3) NOT NULL,
    "label" TEXT,

    CONSTRAINT "tax_slab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_year" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "category" "TaxpayerCategory" NOT NULL DEFAULT 'GENERAL',
    "total_gross" DECIMAL(14,2) NOT NULL,
    "total_earning" DECIMAL(14,2) NOT NULL,
    "non_taxable" DECIMAL(14,2) NOT NULL,
    "taxable" DECIMAL(14,2) NOT NULL,
    "total_tax" DECIMAL(14,2) NOT NULL,
    "allowable_investment" DECIMAL(14,2) NOT NULL,
    "actual_investment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "rebate" DECIMAL(14,2) NOT NULL,
    "advance_income_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "liability" DECIMAL(14,2) NOT NULL,
    "paid_to_date" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_liability" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remaining_months" INTEGER NOT NULL DEFAULT 0,
    "monthly_liability" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "computation" JSONB,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_tax_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_payment" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "fiscal_year" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'deducted_at_source',
    "challan_no" TEXT,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_program" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "self_cost" DECIMAL(10,2) NOT NULL,
    "guest_cost" DECIMAL(10,2) NOT NULL,
    "cancel_cutoff" TEXT NOT NULL DEFAULT '09:30',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "food_program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menu" (
    "id" SERIAL NOT NULL,
    "food_program_id" INTEGER NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "items" JSONB NOT NULL,

    CONSTRAINT "food_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_subscription" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "food_program_id" INTEGER NOT NULL,
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribed_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "meal_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "food_program_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "MealStatus" NOT NULL DEFAULT 'SCHEDULED',
    "taken_at" TIMESTAMP(3),
    "menu_snapshot" JSONB,
    "self_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "guest_count" INTEGER NOT NULL DEFAULT 0,
    "guest_meal_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,

    CONSTRAINT "meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_cycle" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "feedback_start_date" DATE NOT NULL,
    "feedback_end_date" DATE NOT NULL,
    "weight_must_total" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "goal_cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_cycle_member" (
    "goal_cycle_id" INTEGER NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_cycle_member_pkey" PRIMARY KEY ("goal_cycle_id","employee_id")
);

-- CreateTable
CREATE TABLE "goal" (
    "id" SERIAL NOT NULL,
    "goal_cycle_id" INTEGER NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "parent_goal_id" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metric" TEXT,
    "target" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_review" (
    "id" SERIAL NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "reviewer_id" BIGINT NOT NULL,
    "stage" "ReviewStage" NOT NULL DEFAULT 'SELF_ASSESSMENT',
    "rating" INTEGER,
    "comment" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_confirmation_review" (
    "id" SERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "reviewer_id" BIGINT,
    "due_date" DATE NOT NULL,
    "stage" "ReviewStage" NOT NULL DEFAULT 'SELF_ASSESSMENT',
    "decision" "ConfirmationDecision" NOT NULL DEFAULT 'PENDING',
    "scorecard" JSONB,
    "overall_score" DECIMAL(5,2),
    "strengths" TEXT,
    "improvements" TEXT,
    "extended_to_date" DATE,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_confirmation_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "contact_level" "ContactLevel" NOT NULL DEFAULT 'B',
    "org_type" TEXT,
    "contact_person" TEXT,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_visit" (
    "id" BIGSERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "visit_date" DATE NOT NULL,
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "person_visited" TEXT,
    "purpose" TEXT,
    "outcome" TEXT,
    "order_value" DECIMAL(14,2),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "distance_m" INTEGER,
    "photo_path" TEXT,
    "is_joint_visit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_visit_participant" (
    "visit_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,

    CONSTRAINT "customer_visit_participant_pkey" PRIMARY KEY ("visit_id","employee_id")
);

-- CreateTable
CREATE TABLE "tracking_config" (
    "employee_id" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consent_given_at" TIMESTAMP(3),
    "consent_revoked_at" TIMESTAMP(3),
    "window_start" TEXT NOT NULL DEFAULT '09:00',
    "window_end" TEXT NOT NULL DEFAULT '19:00',
    "ping_interval_sec" INTEGER NOT NULL DEFAULT 120,
    "retention_days" INTEGER NOT NULL DEFAULT 90,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_config_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "tracking_session" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" "TrackingSessionStatus" NOT NULL DEFAULT 'ONGOING',
    "distance_km" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "point_count" INTEGER NOT NULL DEFAULT 0,
    "battery_start" INTEGER,
    "battery_end" INTEGER,
    "device_info" TEXT,
    "purged_at" TIMESTAMP(3),

    CONSTRAINT "tracking_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_point" (
    "id" BIGSERIAL NOT NULL,
    "session_id" BIGINT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" INTEGER,
    "speed_kph" DOUBLE PRECISION,

    CONSTRAINT "tracking_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "onboarding_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_template_item" (
    "id" SERIAL NOT NULL,
    "template_id" INTEGER NOT NULL,
    "lane" "OnboardingLane" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_offset_days" INTEGER NOT NULL DEFAULT 0,
    "blocked_by" INTEGER[],
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onboarding_template_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_task" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "template_item_id" INTEGER,
    "lane" "OnboardingLane" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignee_id" BIGINT,
    "due_date" DATE,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "note" TEXT,
    "attachment_path" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resignation" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "notice_period_required_days" INTEGER NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_working_day" DATE NOT NULL,
    "notice_period_served_days" INTEGER NOT NULL,
    "notice_period_recovery_days" INTEGER NOT NULL,
    "date_of_separation" DATE NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "letter_path" TEXT NOT NULL,
    "stage" "ResignationStage" NOT NULL DEFAULT 'SUBMITTED',
    "recovery_amount" DECIMAL(14,2),
    "final_settlement_amount" DECIMAL(14,2),
    "withdrawn_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "resignation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resignation_approval" (
    "id" BIGSERIAL NOT NULL,
    "resignation_id" BIGINT NOT NULL,
    "approver_id" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "resignation_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_department" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "department_id" INTEGER,
    "name" TEXT NOT NULL,
    "checklist" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clearance_department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clearance_item" (
    "id" BIGSERIAL NOT NULL,
    "resignation_id" BIGINT NOT NULL,
    "clearance_department_id" INTEGER NOT NULL,
    "owner_id" BIGINT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "dues_amount" DECIMAL(14,2),
    "remarks" TEXT,
    "checklist_state" JSONB,
    "cleared_at" TIMESTAMP(3),

    CONSTRAINT "clearance_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exit_interview" (
    "id" BIGSERIAL NOT NULL,
    "resignation_id" BIGINT NOT NULL,
    "responses" JSONB NOT NULL,
    "primary_reason" TEXT,
    "would_rejoin" BOOLEAN,
    "nps_score" INTEGER,
    "conducted_by_id" BIGINT,
    "conducted_at" TIMESTAMP(3),

    CONSTRAINT "exit_interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "name" TEXT NOT NULL,
    "floor" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "amenities" TEXT[],
    "color_hex" TEXT,
    "open_time" TEXT NOT NULL DEFAULT '00:00',
    "close_time" TEXT NOT NULL DEFAULT '23:59',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_booking" (
    "id" BIGSERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "organiser_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "agenda" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "recurrence" JSONB,
    "series_id" TEXT,
    "external_guests" TEXT[],
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_booking_attendee" (
    "booking_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "response" "RequestStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "room_booking_attendee_pkey" PRIMARY KEY ("booking_id","employee_id")
);

-- CreateTable
CREATE TABLE "notice" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" BIGINT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "publish_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "attachment_path" TEXT,
    "department_ids" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_policy" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "summary" TEXT,
    "document_path" TEXT,
    "effective_from" DATE NOT NULL,
    "is_latest" BOOLEAN NOT NULL DEFAULT true,
    "requires_ack" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "office_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "helpdesk_ticket" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "requester_id" BIGINT NOT NULL,
    "assignee_id" BIGINT,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "priority" "HelpdeskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "HelpdeskStatus" NOT NULL DEFAULT 'OPEN',
    "attachment_path" TEXT,
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "helpdesk_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" BIGINT,
    "company_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_job" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "requested_by_id" BIGINT NOT NULL,
    "report_type" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "params" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'QUEUED',
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "file_path" TEXT,
    "file_size_bytes" INTEGER,
    "row_count" INTEGER,
    "error" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "report_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_alias_key" ON "company"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "company_feature_company_id_key_key" ON "company_feature"("company_id", "key");

-- CreateIndex
CREATE INDEX "location_company_id_idx" ON "location"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_company_id_alias_key" ON "location"("company_id", "alias");

-- CreateIndex
CREATE INDEX "department_parent_department_id_idx" ON "department"("parent_department_id");

-- CreateIndex
CREATE UNIQUE INDEX "department_company_id_name_key" ON "department"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "designation_company_id_name_key" ON "designation"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "role_company_id_key_key" ON "role"("company_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_employee_id_idx" ON "refresh_token"("employee_id");

-- CreateIndex
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_token_employee_id_idx" ON "password_reset_token"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_employee_visible_id_key" ON "employee"("employee_visible_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_unique_tag_key" ON "employee"("unique_tag");

-- CreateIndex
CREATE UNIQUE INDEX "employee_username_key" ON "employee"("username");

-- CreateIndex
CREATE UNIQUE INDEX "employee_email_key" ON "employee"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_rfid_key" ON "employee"("rfid");

-- CreateIndex
CREATE INDEX "employee_company_id_active_idx" ON "employee"("company_id", "active");

-- CreateIndex
CREATE INDEX "employee_line_manager_id_idx" ON "employee"("line_manager_id");

-- CreateIndex
CREATE INDEX "employee_department_id_idx" ON "employee"("department_id");

-- CreateIndex
CREATE INDEX "employee_designation_id_idx" ON "employee"("designation_id");

-- CreateIndex
CREATE INDEX "employee_first_name_last_name_idx" ON "employee"("first_name", "last_name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_address_employee_id_kind_key" ON "employee_address"("employee_id", "kind");

-- CreateIndex
CREATE INDEX "employee_emergency_employee_id_idx" ON "employee_emergency"("employee_id");

-- CreateIndex
CREATE INDEX "employee_nominee_employee_id_idx" ON "employee_nominee"("employee_id");

-- CreateIndex
CREATE INDEX "employee_education_employee_id_idx" ON "employee_education"("employee_id");

-- CreateIndex
CREATE INDEX "employee_experience_employee_id_idx" ON "employee_experience"("employee_id");

-- CreateIndex
CREATE INDEX "employee_document_employee_id_kind_idx" ON "employee_document"("employee_id", "kind");

-- CreateIndex
CREATE INDEX "profile_change_request_employee_id_status_idx" ON "profile_change_request"("employee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "profile_update_config_company_id_employee_id_key" ON "profile_update_config"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "employee_bank_employee_id_idx" ON "employee_bank"("employee_id");

-- CreateIndex
CREATE INDEX "salary_history_employee_id_effective_from_idx" ON "salary_history"("employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "salary_history_employee_id_effective_from_key" ON "salary_history"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "promotion_history_employee_id_effective_from_idx" ON "promotion_history"("employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "salary_component_company_id_code_key" ON "salary_component"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "shift_company_id_name_key" ON "shift"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_roster_company_id_name_key" ON "attendance_roster"("company_id", "name");

-- CreateIndex
CREATE INDEX "roster_assignment_date_idx" ON "roster_assignment"("date");

-- CreateIndex
CREATE UNIQUE INDEX "roster_assignment_employee_id_date_key" ON "roster_assignment"("employee_id", "date");

-- CreateIndex
CREATE INDEX "attendance_company_id_date_idx" ON "attendance"("company_id", "date");

-- CreateIndex
CREATE INDEX "attendance_date_status_idx" ON "attendance"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employee_id_date_key" ON "attendance"("employee_id", "date");

-- CreateIndex
CREATE INDEX "break_time_attendance_id_idx" ON "break_time"("attendance_id");

-- CreateIndex
CREATE INDEX "attendance_edit_request_employee_id_status_idx" ON "attendance_edit_request"("employee_id", "status");

-- CreateIndex
CREATE INDEX "attendance_edit_request_approver_id_status_idx" ON "attendance_edit_request"("approver_id", "status");

-- CreateIndex
CREATE INDEX "overtime_request_employee_id_status_idx" ON "overtime_request"("employee_id", "status");

-- CreateIndex
CREATE INDEX "overtime_request_approver_id_status_idx" ON "overtime_request"("approver_id", "status");

-- CreateIndex
CREATE INDEX "compensation_request_employee_id_status_idx" ON "compensation_request"("employee_id", "status");

-- CreateIndex
CREATE INDEX "compensation_request_approver_id_status_idx" ON "compensation_request"("approver_id", "status");

-- CreateIndex
CREATE INDEX "shift_exchange_request_requester_id_status_idx" ON "shift_exchange_request"("requester_id", "status");

-- CreateIndex
CREATE INDEX "shift_exchange_request_approver_id_status_idx" ON "shift_exchange_request"("approver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_company_id_key_key" ON "leave_type"("company_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policy_company_id_name_effective_year_key" ON "leave_policy"("company_id", "name", "effective_year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policy_line_leave_policy_id_leave_type_id_key" ON "leave_policy_line"("leave_policy_id", "leave_type_id");

-- CreateIndex
CREATE INDEX "leave_balance_employee_id_year_idx" ON "leave_balance"("employee_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_employee_id_leave_type_id_year_key" ON "leave_balance"("employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "leave_request_employee_id_status_idx" ON "leave_request"("employee_id", "status");

-- CreateIndex
CREATE INDEX "leave_request_approver_id_status_idx" ON "leave_request"("approver_id", "status");

-- CreateIndex
CREATE INDEX "leave_request_start_date_end_date_idx" ON "leave_request"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "leave_carry_forward_employee_id_leave_type_id_from_year_key" ON "leave_carry_forward"("employee_id", "leave_type_id", "from_year");

-- CreateIndex
CREATE INDEX "holiday_company_id_year_idx" ON "holiday"("company_id", "year");

-- CreateIndex
CREATE INDEX "holiday_start_date_end_date_idx" ON "holiday"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_run_company_id_month_year_key" ON "payroll_run"("company_id", "month", "year");

-- CreateIndex
CREATE INDEX "payslip_employee_id_year_idx" ON "payslip"("employee_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_employee_id_month_year_key" ON "payslip"("employee_id", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "tax_config_country_fiscal_year_category_key" ON "tax_config"("country", "fiscal_year", "category");

-- CreateIndex
CREATE UNIQUE INDEX "tax_slab_tax_config_id_seq_key" ON "tax_slab"("tax_config_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_year_employee_id_fiscal_year_key" ON "employee_tax_year"("employee_id", "fiscal_year");

-- CreateIndex
CREATE INDEX "tax_payment_employee_id_fiscal_year_idx" ON "tax_payment"("employee_id", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "tax_payment_employee_id_fiscal_year_month_year_key" ON "tax_payment"("employee_id", "fiscal_year", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "food_program_company_id_name_key" ON "food_program"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_food_program_id_day_of_week_effective_from_key" ON "food_menu"("food_program_id", "day_of_week", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "meal_subscription_employee_id_food_program_id_key" ON "meal_subscription"("employee_id", "food_program_id");

-- CreateIndex
CREATE INDEX "meal_date_idx" ON "meal"("date");

-- CreateIndex
CREATE UNIQUE INDEX "meal_employee_id_food_program_id_date_key" ON "meal"("employee_id", "food_program_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "goal_cycle_company_id_name_key" ON "goal_cycle"("company_id", "name");

-- CreateIndex
CREATE INDEX "goal_employee_id_goal_cycle_id_idx" ON "goal"("employee_id", "goal_cycle_id");

-- CreateIndex
CREATE INDEX "goal_review_goal_id_idx" ON "goal_review"("goal_id");

-- CreateIndex
CREATE INDEX "job_confirmation_review_reviewer_id_decision_idx" ON "job_confirmation_review"("reviewer_id", "decision");

-- CreateIndex
CREATE INDEX "job_confirmation_review_employee_id_idx" ON "job_confirmation_review"("employee_id");

-- CreateIndex
CREATE INDEX "customer_company_id_contact_level_idx" ON "customer"("company_id", "contact_level");

-- CreateIndex
CREATE UNIQUE INDEX "customer_company_id_name_key" ON "customer"("company_id", "name");

-- CreateIndex
CREATE INDEX "customer_visit_employee_id_visit_date_idx" ON "customer_visit"("employee_id", "visit_date");

-- CreateIndex
CREATE INDEX "customer_visit_customer_id_visit_date_idx" ON "customer_visit"("customer_id", "visit_date");

-- CreateIndex
CREATE INDEX "customer_visit_visit_date_idx" ON "customer_visit"("visit_date");

-- CreateIndex
CREATE INDEX "tracking_session_employee_id_started_at_idx" ON "tracking_session"("employee_id", "started_at");

-- CreateIndex
CREATE INDEX "tracking_session_status_idx" ON "tracking_session"("status");

-- CreateIndex
CREATE INDEX "tracking_point_session_id_recorded_at_idx" ON "tracking_point"("session_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_template_company_id_name_key" ON "onboarding_template"("company_id", "name");

-- CreateIndex
CREATE INDEX "onboarding_template_item_template_id_lane_idx" ON "onboarding_template_item"("template_id", "lane");

-- CreateIndex
CREATE INDEX "onboarding_task_employee_id_lane_idx" ON "onboarding_task"("employee_id", "lane");

-- CreateIndex
CREATE INDEX "onboarding_task_assignee_id_status_idx" ON "onboarding_task"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "resignation_employee_id_idx" ON "resignation"("employee_id");

-- CreateIndex
CREATE INDEX "resignation_stage_idx" ON "resignation"("stage");

-- CreateIndex
CREATE INDEX "resignation_approval_approver_id_status_idx" ON "resignation_approval"("approver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_department_company_id_name_key" ON "clearance_department"("company_id", "name");

-- CreateIndex
CREATE INDEX "clearance_item_owner_id_status_idx" ON "clearance_item"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "clearance_item_resignation_id_clearance_department_id_key" ON "clearance_item"("resignation_id", "clearance_department_id");

-- CreateIndex
CREATE UNIQUE INDEX "exit_interview_resignation_id_key" ON "exit_interview"("resignation_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_company_id_name_key" ON "room"("company_id", "name");

-- CreateIndex
CREATE INDEX "room_booking_room_id_start_at_end_at_idx" ON "room_booking"("room_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "room_booking_organiser_id_idx" ON "room_booking"("organiser_id");

-- CreateIndex
CREATE INDEX "room_booking_series_id_idx" ON "room_booking"("series_id");

-- CreateIndex
CREATE INDEX "notice_company_id_publish_at_idx" ON "notice"("company_id", "publish_at");

-- CreateIndex
CREATE INDEX "office_policy_company_id_is_latest_idx" ON "office_policy"("company_id", "is_latest");

-- CreateIndex
CREATE INDEX "notification_employee_id_read_at_idx" ON "notification"("employee_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_created_at_idx" ON "notification"("created_at");

-- CreateIndex
CREATE INDEX "helpdesk_ticket_company_id_status_idx" ON "helpdesk_ticket"("company_id", "status");

-- CreateIndex
CREATE INDEX "helpdesk_ticket_requester_id_idx" ON "helpdesk_ticket"("requester_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_created_at_idx" ON "audit_log"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "report_job_requested_by_id_status_idx" ON "report_job"("requested_by_id", "status");

-- AddForeignKey
ALTER TABLE "company_feature" ADD CONSTRAINT "company_feature_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "department"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designation" ADD CONSTRAINT "designation_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role" ADD CONSTRAINT "employee_role_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_role" ADD CONSTRAINT "employee_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_company_access" ADD CONSTRAINT "employee_company_access_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_company_access" ADD CONSTRAINT "employee_company_access_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designation"("designation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_attendance_roaster_id_fkey" FOREIGN KEY ("attendance_roaster_id") REFERENCES "attendance_roster"("roster_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_leave_policy_id_fkey" FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_line_manager_id_fkey" FOREIGN KEY ("line_manager_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_dotted_manager_1_id_fkey" FOREIGN KEY ("dotted_manager_1_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_dotted_manager_2_id_fkey" FOREIGN KEY ("dotted_manager_2_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_team_leader_id_fkey" FOREIGN KEY ("team_leader_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_head_of_department_id_fkey" FOREIGN KEY ("head_of_department_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_project_manager_id_fkey" FOREIGN KEY ("project_manager_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_referring_employee_id_fkey" FOREIGN KEY ("referring_employee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_address" ADD CONSTRAINT "employee_address_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_emergency" ADD CONSTRAINT "employee_emergency_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_nominee" ADD CONSTRAINT "employee_nominee_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_experience" ADD CONSTRAINT "employee_experience_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_request" ADD CONSTRAINT "profile_change_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_request" ADD CONSTRAINT "profile_change_request_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank" ADD CONSTRAINT "employee_bank_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_benefit" ADD CONSTRAINT "employee_benefit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_history" ADD CONSTRAINT "promotion_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_history" ADD CONSTRAINT "promotion_history_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designation"("designation_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_component" ADD CONSTRAINT "salary_component_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_roster" ADD CONSTRAINT "attendance_roster_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignment" ADD CONSTRAINT "roster_assignment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignment" ADD CONSTRAINT "roster_assignment_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "attendance_roster"("roster_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignment" ADD CONSTRAINT "roster_assignment_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "break_time" ADD CONSTRAINT "break_time_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_request" ADD CONSTRAINT "attendance_edit_request_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_request" ADD CONSTRAINT "attendance_edit_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_edit_request" ADD CONSTRAINT "attendance_edit_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_request" ADD CONSTRAINT "overtime_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_request" ADD CONSTRAINT "compensation_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compensation_request" ADD CONSTRAINT "compensation_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_exchange_request" ADD CONSTRAINT "shift_exchange_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_exchange_request" ADD CONSTRAINT "shift_exchange_request_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_exchange_request" ADD CONSTRAINT "shift_exchange_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_exchange_request" ADD CONSTRAINT "shift_exchange_request_from_shift_id_fkey" FOREIGN KEY ("from_shift_id") REFERENCES "shift"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_exchange_request" ADD CONSTRAINT "shift_exchange_request_to_shift_id_fkey" FOREIGN KEY ("to_shift_id") REFERENCES "shift"("shift_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_type" ADD CONSTRAINT "leave_type_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy" ADD CONSTRAINT "leave_policy_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy_line" ADD CONSTRAINT "leave_policy_line_leave_policy_id_fkey" FOREIGN KEY ("leave_policy_id") REFERENCES "leave_policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policy_line" ADD CONSTRAINT "leave_policy_line_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance" ADD CONSTRAINT "leave_balance_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_carry_forward" ADD CONSTRAINT "leave_carry_forward_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_carry_forward" ADD CONSTRAINT "leave_carry_forward_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("location_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_slab" ADD CONSTRAINT "tax_slab_tax_config_id_fkey" FOREIGN KEY ("tax_config_id") REFERENCES "tax_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_tax_year" ADD CONSTRAINT "employee_tax_year_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_payment" ADD CONSTRAINT "tax_payment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_program" ADD CONSTRAINT "food_program_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu" ADD CONSTRAINT "food_menu_food_program_id_fkey" FOREIGN KEY ("food_program_id") REFERENCES "food_program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_subscription" ADD CONSTRAINT "meal_subscription_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_subscription" ADD CONSTRAINT "meal_subscription_food_program_id_fkey" FOREIGN KEY ("food_program_id") REFERENCES "food_program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal" ADD CONSTRAINT "meal_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal" ADD CONSTRAINT "meal_food_program_id_fkey" FOREIGN KEY ("food_program_id") REFERENCES "food_program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_cycle" ADD CONSTRAINT "goal_cycle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_cycle_member" ADD CONSTRAINT "goal_cycle_member_goal_cycle_id_fkey" FOREIGN KEY ("goal_cycle_id") REFERENCES "goal_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_goal_cycle_id_fkey" FOREIGN KEY ("goal_cycle_id") REFERENCES "goal_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_parent_goal_id_fkey" FOREIGN KEY ("parent_goal_id") REFERENCES "goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_review" ADD CONSTRAINT "goal_review_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_review" ADD CONSTRAINT "goal_review_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_confirmation_review" ADD CONSTRAINT "job_confirmation_review_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_confirmation_review" ADD CONSTRAINT "job_confirmation_review_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit" ADD CONSTRAINT "customer_visit_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit" ADD CONSTRAINT "customer_visit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit_participant" ADD CONSTRAINT "customer_visit_participant_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "customer_visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_visit_participant" ADD CONSTRAINT "customer_visit_participant_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_config" ADD CONSTRAINT "tracking_config_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_session" ADD CONSTRAINT "tracking_session_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_point" ADD CONSTRAINT "tracking_point_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "tracking_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template" ADD CONSTRAINT "onboarding_template_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_template_item" ADD CONSTRAINT "onboarding_template_item_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "onboarding_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_task" ADD CONSTRAINT "onboarding_task_template_item_id_fkey" FOREIGN KEY ("template_item_id") REFERENCES "onboarding_template_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resignation" ADD CONSTRAINT "resignation_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resignation_approval" ADD CONSTRAINT "resignation_approval_resignation_id_fkey" FOREIGN KEY ("resignation_id") REFERENCES "resignation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resignation_approval" ADD CONSTRAINT "resignation_approval_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_department" ADD CONSTRAINT "clearance_department_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_department" ADD CONSTRAINT "clearance_department_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_item" ADD CONSTRAINT "clearance_item_resignation_id_fkey" FOREIGN KEY ("resignation_id") REFERENCES "resignation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_item" ADD CONSTRAINT "clearance_item_clearance_department_id_fkey" FOREIGN KEY ("clearance_department_id") REFERENCES "clearance_department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clearance_item" ADD CONSTRAINT "clearance_item_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_interview" ADD CONSTRAINT "exit_interview_resignation_id_fkey" FOREIGN KEY ("resignation_id") REFERENCES "resignation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room" ADD CONSTRAINT "room_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("location_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking" ADD CONSTRAINT "room_booking_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_attendee" ADD CONSTRAINT "room_booking_attendee_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "room_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_booking_attendee" ADD CONSTRAINT "room_booking_attendee_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_policy" ADD CONSTRAINT "office_policy_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_ticket" ADD CONSTRAINT "helpdesk_ticket_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_ticket" ADD CONSTRAINT "helpdesk_ticket_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "helpdesk_ticket" ADD CONSTRAINT "helpdesk_ticket_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employee"("employee_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_job" ADD CONSTRAINT "report_job_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_job" ADD CONSTRAINT "report_job_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE ON UPDATE CASCADE;

