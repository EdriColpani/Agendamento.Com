import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      companyName,
      razaoSocial,
      cnpj,
      userPhone,
      companyPhone,
      address,
      number,
      neighborhood,
      complement,
      zipCode,
      city,
      state
    } = body;

    console.log('Edge Function Debug (send-company-registration-notification): Payload recebido:', {
      companyName: !!companyName,
      razaoSocial: !!razaoSocial,
      cnpj: !!cnpj,
      userPhone: !!userPhone,
      companyPhone: !!companyPhone,
    });

    if (!companyName || !razaoSocial || !cnpj) {
      console.error('Edge Function Error (send-company-registration-notification): Dados obrigatórios faltando:', {
        hasCompanyName: !!companyName,
        hasRazaoSocial: !!razaoSocial,
        hasCnpj: !!cnpj,
      });
      return new Response(JSON.stringify({ error: 'Missing required data for email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const adminEmail = 'edricolpani@hotmail.com';

    console.log('Edge Function Debug (send-company-registration-notification): Admin email:', adminEmail);
    console.log('Edge Function Debug (send-company-registration-notification): RESEND_API_KEY configured:', !!RESEND_API_KEY);

    if (!RESEND_API_KEY) {
      console.warn('Edge Function Warning (send-company-registration-notification): RESEND_API_KEY não configurada. Email não será enviado.');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Email service not configured' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format phone numbers
    const formatPhone = (phone: string) => {
      if (!phone) return 'N/A';
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 11) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
      } else if (cleaned.length === 10) {
        return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
      }
      return phone;
    };

    // Format CNPJ
    const formatCnpj = (cnpj: string) => {
      if (!cnpj) return 'N/A';
      const cleaned = cnpj.replace(/\D/g, '');
      if (cleaned.length === 14) {
        return `${cleaned.substring(0, 2)}.${cleaned.substring(2, 5)}.${cleaned.substring(5, 8)}/${cleaned.substring(8, 12)}-${cleaned.substring(12)}`;
      }
      return cnpj;
    };

    // Format ZIP code
    const formatZipCode = (zip: string) => {
      if (!zip) return '';
      const cleaned = zip.replace(/\D/g, '');
      if (cleaned.length === 8) {
        return `${cleaned.substring(0, 5)}-${cleaned.substring(5)}`;
      }
      return zip;
    };

    const formattedUserPhone = formatPhone(userPhone || '');
    const formattedCompanyPhone = formatPhone(companyPhone || '');
    const formattedCnpj = formatCnpj(cnpj || '');
    const formattedZipCode = formatZipCode(zipCode || '');
    
    // Build address string
    const addressParts = [
      address || '',
      number ? `Nº ${number}` : '',
      neighborhood || '',
      complement || '',
      city || '',
      state || '',
      formattedZipCode
    ].filter(part => part.trim() !== '');
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'N/A';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #F59E0B; color: #000; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .info-row { margin: 10px 0; padding: 10px; background-color: #fff; border-left: 3px solid #F59E0B; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; margin-top: 5px; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>Novo Cadastro de Empresa</h2>
          </div>
          <div class="content">
            <p>Uma nova empresa foi cadastrada no sistema TipoAgenda.</p>
            
            <div class="info-row">
              <div class="label">Nome Fantasia:</div>
              <div class="value">${companyName || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Razão Social:</div>
              <div class="value">${razaoSocial || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">CNPJ:</div>
              <div class="value">${formattedCnpj || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Telefone do Usuário:</div>
              <div class="value">${formattedUserPhone || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Telefone da Empresa:</div>
              <div class="value">${formattedCompanyPhone || 'N/A'}</div>
            </div>
            
            <div class="info-row">
              <div class="label">Endereço da Empresa:</div>
              <div class="value">${fullAddress}</div>
            </div>
            
            <div class="footer">
              <p>© TipoAgenda - Todos os direitos reservados</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('Edge Function Debug (send-company-registration-notification): Enviando email via Resend para:', adminEmail);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PlanoAgenda <noreply@planoagenda.com.br>',
        to: adminEmail,
        subject: 'Novo cadastro de empresa',
        html: emailHtml,
      }),
    });

    const resendData = await resendResponse.json();

    console.log('Edge Function Debug (send-company-registration-notification): Resend response status/ok:', {
      status: resendResponse.status,
      ok: resendResponse.ok,
    });

    if (resendResponse.ok) {
      console.log('Edge Function Debug (send-company-registration-notification): Email de notificação enviado com sucesso via Resend API para:', adminEmail);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      console.error('Edge Function Error (send-company-registration-notification): Resend API error:', resendData);
      
      if (resendData.statusCode === 403 && resendData.message?.includes('testing emails')) {
        console.warn('Edge Function Warning (send-company-registration-notification): Resend está em modo de teste. Você só pode enviar emails para o email da sua conta do Resend.');
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Failed to send email',
        error: resendData 
      }), {
        status: 200, // Retorna 200 para não quebrar o fluxo, mas indica falha
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (error: any) {
    console.error('Edge Function Error (send-company-registration-notification): Uncaught exception:', error.message);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
