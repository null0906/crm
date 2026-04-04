import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});
const db = drizzle(pool, { schema });

async function seed() {
  console.log('🌱 Seeding database...');

  // 1. Create default roles
  const roleData: schema.NewRole[] = [
    {
      name: 'Super Admin',
      slug: 'super_admin',
      description: 'Full system access',
      isSystemRole: true,
      permissions: {
        contacts: { create: true, read: 'all', update: 'all', delete: true, export: true },
        companies: { create: true, read: 'all', update: 'all', delete: true, export: true },
        deals: { create: true, read: 'all', update: 'all', delete: true, export: true },
        activities: { create: true, read: 'all', update: 'all', delete: true },
        dashboards: { create: true, read: 'all', update: 'all', delete: true, publish: true },
        settings: { users: true, roles: true, custom_fields: true, tags: true, pipelines: true },
        reports: { view: true, export: true },
        imports: { create: true },
        audit_log: { read: true },
        tags: { manage: true },
        users: { manage: true },
        roles: { manage: true },
      },
    },
    {
      name: 'Sales Manager',
      slug: 'sales_manager',
      description: 'Team leads who manage pipeline',
      isSystemRole: true,
      permissions: {
        contacts: { create: true, read: 'all', update: 'all', delete: true, export: true },
        companies: { create: true, read: 'all', update: 'all', delete: true, export: true },
        deals: { create: true, read: 'all', update: 'all', delete: false, export: true },
        activities: { create: true, read: 'all', update: 'all', delete: false },
        dashboards: { create: true, read: 'all', update: 'all', delete: false, publish: true },
        settings: { users: false, roles: false, custom_fields: false, tags: true, pipelines: false },
        reports: { view: true, export: false },
        imports: { create: true },
        audit_log: { read: false },
        tags: { manage: true },
        users: { manage: false },
        roles: { manage: false },
      },
    },
    {
      name: 'Sales Rep',
      slug: 'sales_rep',
      description: 'Individual contributors',
      isSystemRole: true,
      permissions: {
        contacts: { create: true, read: 'all', update: 'own', delete: false, export: false },
        companies: { create: true, read: 'all', update: 'own', delete: false, export: false },
        deals: { create: true, read: 'own', update: 'own', delete: false, export: false },
        activities: { create: true, read: 'own', update: 'own', delete: false },
        dashboards: { create: false, read: 'all', update: false, delete: false, publish: false },
        settings: { users: false, roles: false, custom_fields: false, tags: true, pipelines: false },
        reports: { view: true, export: false },
        imports: { create: false },
        audit_log: { read: false },
        tags: { manage: true },
        users: { manage: false },
        roles: { manage: false },
      },
    },
    {
      name: 'Viewer',
      slug: 'viewer',
      description: 'Read-only dashboard access',
      isSystemRole: true,
      permissions: {
        contacts: { create: false, read: 'all', update: false, delete: false, export: false },
        companies: { create: false, read: 'all', update: false, delete: false, export: false },
        deals: { create: false, read: 'all', update: false, delete: false, export: false },
        activities: { create: false, read: 'all', update: false, delete: false },
        dashboards: { create: false, read: 'all', update: false, delete: false, publish: false },
        settings: { users: false, roles: false, custom_fields: false, tags: false, pipelines: false },
        reports: { view: true, export: false },
        imports: { create: false },
        audit_log: { read: false },
        tags: { manage: false },
        users: { manage: false },
        roles: { manage: false },
      },
    },
    {
      name: 'Intern',
      slug: 'intern',
      description: 'Limited access team member',
      isSystemRole: true,
      permissions: {
        contacts: { create: false, read: 'team', update: false, delete: false, export: false },
        companies: { create: false, read: 'team', update: false, delete: false, export: false },
        deals: { create: false, read: false, update: false, delete: false, export: false },
        activities: { create: true, read: 'own', update: 'own', delete: false },
        dashboards: { create: false, read: 'all', update: false, delete: false, publish: false },
        settings: { users: false, roles: false, custom_fields: false, tags: false, pipelines: false },
        reports: { view: false, export: false },
        imports: { create: false },
        audit_log: { read: false },
        tags: { manage: false },
        users: { manage: false },
        roles: { manage: false },
      },
    },
  ];

  console.log('Creating roles...');
  const insertedRoles = await db.insert(schema.roles).values(roleData).returning();
  const roleMap = Object.fromEntries(insertedRoles.map((r) => [r.slug, r.id]));

  // 2. Create admin users
  const bcryptRounds = Number(process.env.BCRYPT_ROUNDS) || 12;
  const defaultPassword = await bcrypt.hash('SecComply@2026', bcryptRounds);

  const userData: schema.NewUser[] = [
    {
      email: 'sanil@seccomply.com',
      passwordHash: defaultPassword,
      firstName: 'Sanil',
      lastName: 'Nadkarni',
      roleId: roleMap['super_admin']!,
      status: 'active',
    },
    {
      email: 'atharva@seccomply.com',
      passwordHash: defaultPassword,
      firstName: 'Atharva',
      lastName: 'Sardesai',
      roleId: roleMap['super_admin']!,
      status: 'active',
    },
    {
      email: 'shivani@seccomply.com',
      passwordHash: defaultPassword,
      firstName: 'Shivani',
      lastName: 'Nadkarni',
      roleId: roleMap['sales_manager']!,
      status: 'active',
    },
  ];

  console.log('Creating users...');
  const insertedUsers = await db.insert(schema.users).values(userData).returning();
  const adminUserId = insertedUsers[0]!.id;

  // 3. Create default pipelines
  console.log('Creating pipelines...');

  const salesPipeline = await db.insert(schema.pipelines).values({
    name: 'Sales Pipeline',
    description: 'Default sales pipeline',
    isDefault: true,
    isActive: true,
    createdBy: adminUserId,
    position: 0,
  }).returning().then(r => r[0]!);

  await db.insert(schema.pipelineStages).values([
    { pipelineId: salesPipeline.id, name: 'Lead In', slug: 'lead_in', position: 0, color: '#6B7280', stageType: 'active', defaultProbability: 10 },
    { pipelineId: salesPipeline.id, name: 'Qualified', slug: 'qualified', position: 1, color: '#3B82F6', stageType: 'active', defaultProbability: 25 },
    { pipelineId: salesPipeline.id, name: 'Discovery', slug: 'discovery', position: 2, color: '#8B5CF6', stageType: 'active', defaultProbability: 40 },
    { pipelineId: salesPipeline.id, name: 'Demo', slug: 'demo', position: 3, color: '#EC4899', stageType: 'active', defaultProbability: 55 },
    { pipelineId: salesPipeline.id, name: 'Proposal', slug: 'proposal', position: 4, color: '#F59E0B', stageType: 'active', defaultProbability: 70 },
    { pipelineId: salesPipeline.id, name: 'Negotiation', slug: 'negotiation', position: 5, color: '#F97316', stageType: 'active', defaultProbability: 85 },
    { pipelineId: salesPipeline.id, name: 'Closed Won', slug: 'closed_won', position: 6, color: '#10B981', stageType: 'won', defaultProbability: 100, isSystemStage: true },
    { pipelineId: salesPipeline.id, name: 'Closed Lost', slug: 'closed_lost', position: 7, color: '#EF4444', stageType: 'lost', defaultProbability: 0, isSystemStage: true },
  ]);

  const partnerPipeline = await db.insert(schema.pipelines).values({
    name: 'Partner Pipeline',
    description: 'Partner acquisition pipeline',
    isDefault: false,
    isActive: true,
    createdBy: adminUserId,
    position: 1,
  }).returning().then(r => r[0]!);

  await db.insert(schema.pipelineStages).values([
    { pipelineId: partnerPipeline.id, name: 'Identified', slug: 'identified', position: 0, color: '#6B7280', stageType: 'active', defaultProbability: 10 },
    { pipelineId: partnerPipeline.id, name: 'Outreach', slug: 'outreach', position: 1, color: '#3B82F6', stageType: 'active', defaultProbability: 25 },
    { pipelineId: partnerPipeline.id, name: 'Evaluation', slug: 'evaluation', position: 2, color: '#8B5CF6', stageType: 'active', defaultProbability: 50 },
    { pipelineId: partnerPipeline.id, name: 'Agreement', slug: 'agreement', position: 3, color: '#F59E0B', stageType: 'active', defaultProbability: 75 },
    { pipelineId: partnerPipeline.id, name: 'Active Partner', slug: 'active_partner', position: 4, color: '#10B981', stageType: 'won', defaultProbability: 100, isSystemStage: true },
    { pipelineId: partnerPipeline.id, name: 'Declined', slug: 'declined', position: 5, color: '#EF4444', stageType: 'lost', defaultProbability: 0, isSystemStage: true },
  ]);

  const enterprisePipeline = await db.insert(schema.pipelines).values({
    name: 'Enterprise Pipeline',
    description: 'Enterprise sales pipeline',
    isDefault: false,
    isActive: true,
    createdBy: adminUserId,
    position: 2,
  }).returning().then(r => r[0]!);

  await db.insert(schema.pipelineStages).values([
    { pipelineId: enterprisePipeline.id, name: 'Inbound', slug: 'inbound', position: 0, color: '#6B7280', stageType: 'active', defaultProbability: 10 },
    { pipelineId: enterprisePipeline.id, name: 'Qualification', slug: 'qualification', position: 1, color: '#3B82F6', stageType: 'active', defaultProbability: 20 },
    { pipelineId: enterprisePipeline.id, name: 'Technical Assessment', slug: 'technical_assessment', position: 2, color: '#8B5CF6', stageType: 'active', defaultProbability: 35 },
    { pipelineId: enterprisePipeline.id, name: 'POC', slug: 'poc', position: 3, color: '#EC4899', stageType: 'active', defaultProbability: 50 },
    { pipelineId: enterprisePipeline.id, name: 'Security Review', slug: 'security_review', position: 4, color: '#F59E0B', stageType: 'active', defaultProbability: 65 },
    { pipelineId: enterprisePipeline.id, name: 'Commercial', slug: 'commercial', position: 5, color: '#F97316', stageType: 'active', defaultProbability: 80 },
    { pipelineId: enterprisePipeline.id, name: 'Closed Won', slug: 'closed_won', position: 6, color: '#10B981', stageType: 'won', defaultProbability: 100, isSystemStage: true },
    { pipelineId: enterprisePipeline.id, name: 'Closed Lost', slug: 'closed_lost', position: 7, color: '#EF4444', stageType: 'lost', defaultProbability: 0, isSystemStage: true },
  ]);

  // 4. Create tag categories
  console.log('Creating tag categories and tags...');
  const tagCategoryData = [
    { name: 'Framework Interest', color: '#3B82F6', description: 'Compliance frameworks the contact is interested in' },
    { name: 'Engagement Status', color: '#10B981', description: 'Current engagement temperature' },
    { name: 'Lead Source', color: '#8B5CF6', description: 'How this lead was acquired' },
    { name: 'Industry Vertical', color: '#F59E0B', description: 'Industry sector' },
    { name: 'Deal Priority', color: '#EF4444', description: 'Deal urgency and priority' },
  ];

  const insertedCategories = await db.insert(schema.tagCategories).values(tagCategoryData).returning();
  const catMap = Object.fromEntries(insertedCategories.map((c) => [c.name, c.id]));

  await db.insert(schema.tags).values([
    { name: 'ISO 27001', slug: 'iso-27001', color: '#3B82F6', categoryId: catMap['Framework Interest'], createdBy: adminUserId },
    { name: 'SOC 2', slug: 'soc-2', color: '#6366F1', categoryId: catMap['Framework Interest'], createdBy: adminUserId },
    { name: 'DPDP Act', slug: 'dpdp-act', color: '#8B5CF6', categoryId: catMap['Framework Interest'], createdBy: adminUserId },
    { name: 'CERT-IN', slug: 'cert-in', color: '#A855F7', categoryId: catMap['Framework Interest'], createdBy: adminUserId },
    { name: 'EU AI Act', slug: 'eu-ai-act', color: '#D946EF', categoryId: catMap['Framework Interest'], createdBy: adminUserId },
    { name: 'Hot Lead', slug: 'hot-lead', color: '#EF4444', categoryId: catMap['Engagement Status'], createdBy: adminUserId },
    { name: 'Warm Lead', slug: 'warm-lead', color: '#F59E0B', categoryId: catMap['Engagement Status'], createdBy: adminUserId },
    { name: 'Cold Lead', slug: 'cold-lead', color: '#6B7280', categoryId: catMap['Engagement Status'], createdBy: adminUserId },
    { name: 'Apollo Import', slug: 'apollo-import', color: '#8B5CF6', categoryId: catMap['Lead Source'], createdBy: adminUserId },
    { name: 'Website Inbound', slug: 'website-inbound', color: '#06B6D4', categoryId: catMap['Lead Source'], createdBy: adminUserId },
    { name: 'Referral', slug: 'referral', color: '#10B981', categoryId: catMap['Lead Source'], createdBy: adminUserId },
    { name: 'Manufacturing', slug: 'manufacturing', color: '#F97316', categoryId: catMap['Industry Vertical'], createdBy: adminUserId },
    { name: 'IT Services', slug: 'it-services', color: '#0EA5E9', categoryId: catMap['Industry Vertical'], createdBy: adminUserId },
    { name: 'BFSI', slug: 'bfsi', color: '#14B8A6', categoryId: catMap['Industry Vertical'], createdBy: adminUserId },
    { name: 'Healthcare', slug: 'healthcare', color: '#F43F5E', categoryId: catMap['Industry Vertical'], createdBy: adminUserId },
    { name: 'High Priority', slug: 'high-priority', color: '#EF4444', categoryId: catMap['Deal Priority'], createdBy: adminUserId },
    { name: 'Strategic', slug: 'strategic', color: '#7C3AED', categoryId: catMap['Deal Priority'], createdBy: adminUserId },
  ]);

  // 5. Create custom field definitions
  console.log('Creating custom field definitions...');
  await db.insert(schema.customFieldDefinitions).values([
    // Contact custom fields
    {
      entityType: 'contact',
      name: 'Budget Range',
      slug: 'budget_range',
      fieldType: 'select',
      config: { options: [
        { value: 'under_5l', label: 'Under ₹5L' },
        { value: '5l_15l', label: '₹5L - ₹15L' },
        { value: '15l_50l', label: '₹15L - ₹50L' },
        { value: 'above_50l', label: 'Above ₹50L' },
      ]},
      position: 0,
      section: 'Financial Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    {
      entityType: 'contact',
      name: 'Decision Timeline',
      slug: 'decision_timeline',
      fieldType: 'select',
      config: { options: [
        { value: 'immediate', label: 'Immediate (< 1 month)' },
        { value: 'short', label: 'Short (1-3 months)' },
        { value: 'medium', label: 'Medium (3-6 months)' },
        { value: 'long', label: 'Long (6+ months)' },
      ]},
      position: 1,
      section: 'Financial Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    {
      entityType: 'contact',
      name: 'Current GRC Tool',
      slug: 'current_grc_tool',
      fieldType: 'text',
      config: { max_length: 200, placeholder: 'e.g. Sprinto, Vanta, Spreadsheet' },
      position: 2,
      section: 'Technical Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    // Company custom fields
    {
      entityType: 'company',
      name: 'Compliance Frameworks',
      slug: 'compliance_frameworks',
      fieldType: 'multi_select',
      config: { options: [
        { value: 'iso_27001', label: 'ISO 27001' },
        { value: 'soc2', label: 'SOC 2' },
        { value: 'gdpr', label: 'GDPR' },
        { value: 'hipaa', label: 'HIPAA' },
        { value: 'pci_dss', label: 'PCI DSS' },
        { value: 'dpdp', label: 'DPDP Act' },
      ]},
      position: 0,
      section: 'Compliance Profile',
      isFilterable: true,
      createdBy: adminUserId,
    },
    {
      entityType: 'company',
      name: 'Annual Security Budget',
      slug: 'annual_security_budget',
      fieldType: 'currency',
      config: { currency_code: 'INR', decimal_places: 0 },
      position: 1,
      section: 'Financial Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    {
      entityType: 'company',
      name: 'IT Team Size',
      slug: 'it_team_size',
      fieldType: 'number',
      config: { min: 0, max: 10000 },
      position: 2,
      section: 'Technical Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    // Deal custom fields
    {
      entityType: 'deal',
      name: 'Contract Length (Months)',
      slug: 'contract_length_months',
      fieldType: 'number',
      config: { min: 1, max: 60 },
      position: 0,
      section: 'Deal Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    {
      entityType: 'deal',
      name: 'Competitor in Play',
      slug: 'competitor_in_play',
      fieldType: 'select',
      config: { options: [
        { value: 'sprinto', label: 'Sprinto' },
        { value: 'vanta', label: 'Vanta' },
        { value: 'drata', label: 'Drata' },
        { value: 'scrut', label: 'Scrut' },
        { value: 'none', label: 'None / Unknown' },
      ]},
      position: 1,
      section: 'Deal Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
    {
      entityType: 'deal',
      name: 'POC Required',
      slug: 'poc_required',
      fieldType: 'checkbox',
      config: {},
      position: 2,
      section: 'Deal Details',
      isFilterable: true,
      createdBy: adminUserId,
    },
  ]);

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Admin credentials:');
  console.log('  sanil@seccomply.com    → SecComply@2026');
  console.log('  atharva@seccomply.com  → SecComply@2026');
  console.log('  shivani@seccomply.com  → SecComply@2026');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
