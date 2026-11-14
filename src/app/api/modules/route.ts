import { NextRequest, NextResponse } from 'next/server';
import { ModuleRegistry } from '@/core/registry/module-registry';
import { initializeSystemModules } from '@/modules/init';
import { getTenantContext } from '@/core/tenancy/context';

export async function GET(req: NextRequest) {
  initializeSystemModules();
  try {
    const tenant = await getTenantContext(req);
    const modules = ModuleRegistry.getAllModules(tenant.companyId);
    return NextResponse.json({ success: true, modules });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  initializeSystemModules();
  try {
    const tenant = await getTenantContext(req);

    if (tenant.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: Only administrators can toggle system modules.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { moduleId, enable } = body;

    if (!moduleId || typeof enable !== 'boolean') {
      return NextResponse.json({ success: false, message: 'Invalid payload.' }, { status: 400 });
    }

    const result = ModuleRegistry.toggleModule(moduleId, enable, tenant.companyId);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: result.message,
      affectedModules: result.affectedModules,
      modules: result.modules || ModuleRegistry.getAllModules(tenant.companyId)
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

