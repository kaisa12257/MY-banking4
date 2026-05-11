import os
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, session
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv  # <-- 이거 확인!

# =========================
# Supabase 설정 (보안 강화 버전)
# =========================
# .env 파일을 읽어옵니다. 한글 에러 방지를 위해 encoding 추가!
app = Flask(__name__)
app.secret_key = "money_guardian_key"

load_dotenv(encoding='utf-8')

# 이제 직접 적지 않고 환경 변수에서 가져옵니다.
SUPABASE_URL = os.environ.get("SUPABASE_URL") 
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# 연결 시도
try:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("⚠️ 관리자 알림: .env 파일에서 키를 찾을 수 없습니다!")
    
    options = ClientOptions(postgrest_client_timeout=10)
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY, options=options)
    print("✅ Supabase 연결 성공!")
except Exception as e:
    # 키가 없을 경우를 대비해 한 번 더 시도하거나 에러 출력
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    except:
        print(f"❌ DB 연결 실패: {e}")


@app.route('/')
def index():
    return render_template('index.html')


# =========================
# 인증 (Auth)
# =========================
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    email = data['email']
    
    try:
        # 탈퇴 기록 테이블(withdrawn_users)에서 해당 이메일의 마지막 탈퇴일 조회
        res = supabase.table('withdrawn_users') \
            .select("withdrawn_at") \
            .eq("email", email) \
            .order("withdrawn_at", desc=True) \
            .limit(1) \
            .execute()
        
        if res.data:
            # 문자열 형태의 시간을 파이썬 datetime 객체로 변환
            withdraw_time_str = res.data[0]['withdrawn_at'].replace('Z', '').split('+')[0]
            withdraw_time = datetime.fromisoformat(withdraw_time_str)
            
            # 현재 시간과 비교하여 2일(48시간)이 지났는지 체크
            if datetime.now() < withdraw_time + timedelta(days=2):
                diff = (withdraw_time + timedelta(days=2)) - datetime.now()
                hours = int(diff.total_seconds() // 3600)
                return jsonify({
                    "status": "error", 
                    "message": f"탈퇴한 지 얼마 되지 않았습니다. 약 {hours}시간 뒤에 가입 가능합니다."
                }), 400

        # 탈퇴 기록이 없거나 2일이 지났다면 기존 가입 로직 진행
        supabase.auth.sign_up({
            "email": data['email'],
            "password": data['password'],
            "options": {"data": {"display_name": data['name']}}
        })
        return jsonify({"status": "success", "message": "가입 성공!"})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route('/api/login', methods=['POST'])
def do_login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    # 1. [보안 검색대] 탈퇴 기록이 있는지 먼저 확인
    try:
        check_withdrawn = supabase.table('withdrawn_users')\
            .select('*')\
            .eq('email', email)\
            .execute()
        
        # 만약 DB에 탈퇴 기록이 남아있다면?
        if check_withdrawn.data:
            return jsonify({
                "status": "error", 
                "message": "탈퇴 처리된 계정입니다. 2일 뒤에 다시 가입해 주세요."
            }), 403 # 403 Forbidden: 접근 금지
            
    except Exception as e:
        print(f"탈퇴 조회 중 오류 발생: {e}")
        # 오류가 나더라도 안전하게 로그인은 막는 게 좋으므로 pass 대신 에러 처리 가능

    # 2. [기존 로직] 탈퇴 기록이 없을 때만 로그인 시도
    try:
        res = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        user = res.user
        session['user_id'] = user.id
        session['user_name'] = user.user_metadata.get('display_name', '사용자')
        session['user_email'] = user.email
        
        return jsonify({
            "status": "success", 
            "user_name": session['user_name'],
            "user_email": user.email,
            "joined_at": user.created_at
        })
    except:
        return jsonify({"status": "error", "message": "아이디 또는 비밀번호가 일치하지 않습니다."}), 401

@app.route('/api/logout', methods=['POST'])
def do_logout():
    session.clear()
    try:
        supabase.auth.sign_out()
    except:
        pass
    return jsonify({"status": "success"})
# =========================
# 3. 회원 탈퇴 API 추가
# =========================
@app.route('/api/withdraw', methods=['POST'])
def withdraw():
    if 'user_id' not in session: 
        return jsonify({"status": "error", "message": "로그인 세션이 없습니다."}), 401
    
    user_id = session.get('user_id')
    email = session.get('user_email') or "unknown@example.com"

    try:
        # 1. 탈퇴 기록 저장 (이건 이미 잘 되고 있습니다!)
        supabase.table('withdrawn_users').insert({
            "email": email,
            "withdrawn_at": datetime.now().isoformat()
        }).execute()

        # 2. 계정 삭제 시도 (실패해도 무시하고 진행)
        try:
            supabase.auth.admin.delete_user(user_id)
        except Exception as auth_err:
            print(f"Auth 삭제 권한 없음 (무시하고 진행): {auth_err}")

        # 3. 강제 로그아웃 (세션과 Supabase 인증 모두 해제)
        session.clear()
        try:
            supabase.auth.sign_out()
        except:
            pass
            
        return jsonify({"status": "success"})

    except Exception as e:
        # 기록 저장 자체가 실패했을 때만 에러 반환
        return jsonify({"status": "error", "message": f"시스템 오류: {str(e)}"}), 500
# =========================
# 지출 (Expenses)
# =========================
@app.route('/api/add_expense', methods=['POST'])
def add_expense():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    supabase.table('expenses').insert({
        "user_id": session['user_id'],
        "amount": data['amount'],
        "category": data['category'],
        "description": data['description'],
        "expense_date": data['expense_date']
    }).execute()
    return jsonify({"status": "success"})


@app.route('/api/get_expenses', methods=['GET'])
def get_expenses():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    res = supabase.table('expenses').select("*").eq("user_id", session['user_id']).order("expense_date", desc=True).execute()
    return jsonify({"status": "success", "data": res.data})


@app.route('/api/delete_expense', methods=['POST'])
def delete_expense():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    supabase.table('expenses').delete().eq("id", data['id']).eq("user_id", session['user_id']).execute()
    return jsonify({"status": "success"})


# =========================
# 고정 지출 (Fixed Expenses)
# =========================
@app.route('/api/add_fixed_expense', methods=['POST'])
def add_fixed_expense():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    supabase.table('fixed_expenses').insert({
        "user_id": session['user_id'],
        "description": data['description'],
        "amount": data['amount'],
        "fixed_date": data['fixed_date']
    }).execute()
    return jsonify({"status": "success"})


@app.route('/api/get_fixed_expenses', methods=['GET'])
def get_fixed_expenses():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    res = supabase.table('fixed_expenses').select("*").eq("user_id", session['user_id']).order("fixed_date").execute()
    return jsonify({"status": "success", "data": res.data})


@app.route('/api/delete_fixed_expense', methods=['POST'])
def delete_fixed_expense():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    supabase.table('fixed_expenses').delete().eq("id", data['id']).eq("user_id", session['user_id']).execute()
    return jsonify({"status": "success"})


# =========================
# 월별 목표 예산 (Monthly Budgets)
# =========================
@app.route('/api/save_budget', methods=['POST'])
def save_budget():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    supabase.table('monthly_budgets').upsert({
        "user_id": session['user_id'],
        "budget_month": data['month'],
        "budget_amount": data['amount']
    }, on_conflict="user_id,budget_month").execute()
    return jsonify({"status": "success"})


@app.route('/api/get_budgets', methods=['GET'])
def get_budgets():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    res = supabase.table('monthly_budgets').select("*").eq("user_id", session['user_id']).order("budget_month", desc=True).execute()
    return jsonify({"status": "success", "data": res.data})


@app.route('/api/delete_budget', methods=['POST'])
def delete_budget():
    if 'user_id' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    supabase.table('monthly_budgets').delete().eq("budget_month", data['month']).eq("user_id", session['user_id']).execute()
    return jsonify({"status": "success"})


# =========================
# 저축 (Savings)
# =========================
@app.route('/api/delete_savings', methods=['POST'])
def delete_savings():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.json

    try:
        supabase.table('savings') \
            .delete() \
            .eq("id", data['id']) \
            .eq("user_id", session['user_id']) \
            .execute()

        return jsonify({"status": "success"})

    except Exception as e:
        print("저축 삭제 오류:", e)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/add_savings', methods=['POST'])
def add_savings():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    data = request.json

    try:
        insert_data = {
            "user_id": session['user_id'],
            "amount": int(data['amount']),
            "type": data.get('type', '자유'),
            "description": data.get('description', '')
        }

        supabase.table('savings').insert(insert_data).execute()

        return jsonify({
            "status": "success",
            "message": "저장 완료"
        })

    except Exception as e:
        print("저축 저장 오류:", e)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/get_savings', methods=['GET'])
def get_savings():
    if 'user_id' not in session:
        return jsonify({"status": "error"}), 401

    try:
        res = (
            supabase.table('savings')
            .select("*")
            .eq("user_id", session['user_id'])
            .order("created_at", desc=True)
            .execute()
        )

        return jsonify({
            "status": "success",
            "data": res.data
        })

    except Exception as e:
        print("저축 조회 오류:", e)
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
if __name__ == '__main__':
    app.run(debug=True, port=5000)