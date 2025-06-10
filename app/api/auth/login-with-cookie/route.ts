import { type NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/lib/auth/client';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    console.log('🔐 API Login attempt for:', validatedData.email);

    const result = await signIn.email({
      email: validatedData.email,
      password: validatedData.password,
    });

    console.log('✅ API Login successful, result:', result);

    if (result?.data?.token) {
      console.log('🍪 Setting session cookie manually:', result.data.token);

      const response = NextResponse.json({
        success: true,
        user: result.data.user,
        redirect: '/',
      });

      // Manually set the session cookie with proper attributes
      response.cookies.set('better-auth.session_token', result.data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      console.log('🍪 Session cookie set manually in response');
      return response;
    }

    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    );
  } catch (error) {
    console.log('❌ API Login error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    );
  }
}
