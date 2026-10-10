# Writes the six SYNTHETIC demo calls to fixtures/calls/*.json.
# Every name, card number and line here is invented. No real call content is used.
import json, os
OP, CA = "operator", "caller"

def build(cid, title, plan, member, role, expect, lines):
    segs = []
    for i, (sp, start, text) in enumerate(lines):
        nxt = lines[i + 1][1] if i + 1 < len(lines) else start + max(2.0, len(text.split()) / 2.6)
        segs.append({"id": i + 1, "speaker": sp, "start": float(start), "end": round(float(nxt) - 0.4, 1), "text": text})
    return {"id": cid, "title": title, "synthetic": True, "plan_code": plan, "member_name": member,
            "caller_role": role, "expect": expect, "segments": segs}

common_intro = lambda name: [
    (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
]

calls = []

# 1. Clean self-signup
calls.append(build("call_1", "Clean self-signup", "value_monthly", "Ruth Alvarez", "self",
  {"gate": 200, "summary": "All 7 phone items present with clear answers. First charge goes through."}, [
  (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
  (CA, 6, "Hi, I'd like to sign up for myself. My name is Ruth Alvarez."),
  (OP, 11, "Happy to help, Ruth. GoGo lets you book rides and order groceries and meals by phone, with no smartphone app. You call or text us, we book the ride with a driver service, and we keep an eye on the trip."),
  (CA, 24, "That sounds right for me."),
  (OP, 27, "Can I get your home address for pickups?"),
  (CA, 30, "It's 41 Maple Court, Springfield."),
  (OP, 35, "Thank you. The Value plan is $34.00 per month, billed monthly to the card you give me."),
  (CA, 43, "Yes, $34 a month is fine."),
  (OP, 47, "Your membership automatically renews every month unless you cancel."),
  (CA, 52, "Yes, I understand it renews."),
  (OP, 56, "You can cancel any time and there is no cancellation fee. To cancel, call us, email us, or cancel online in your account settings."),
  (CA, 65, "Okay, good to know."),
  (OP, 68, "Our toll-free number is 1-855-464-6872 and our email is support@gogograndparent.com, for cancelling or any questions."),
  (CA, 77, "Let me write that down. Got it."),
  (OP, 82, "Our Terms include an arbitration agreement and a class action waiver, so disputes go to individual arbitration instead of court."),
  (CA, 91, "Understood."),
  (OP, 94, "Ruth, do you authorize GoGoGrandparent to charge your Visa ending in 4417 $34.00 today and every month until you cancel?"),
  (CA, 103, "Yes, I authorize that."),
  (OP, 106, "Thank you. You'll get a written confirmation by email before the first charge."),
]))

# 2. Daughter signs up her mother (family signup, Section 4.2(h))
calls.append(build("call_2", "Daughter signs up her mother", "premium_monthly", "Lin Chen", "loved_one",
  {"gate": 200, "summary": "Family signup detected. 7 phone items plus the 4 family items all present. First charge goes through."}, [
  (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
  (CA, 6, "Hi, I'm Maya Chen. I'm calling to sign up my mother, Lin Chen. She can't use apps anymore."),
  (OP, 13, "Of course. GoGo lets your mother book rides and order groceries and meals by phone, with no app. She calls or texts us, we book the ride with a driver service, and we keep an eye on the trip and can update you."),
  (CA, 27, "That's exactly what she needs."),
  (OP, 30, "The Premium plan is $59.00 per month, billed monthly to the card on the account."),
  (CA, 37, "Yes, $59 a month works."),
  (OP, 40, "The membership automatically renews each month unless you or your mother cancel."),
  (CA, 46, "Yes, I understand."),
  (OP, 49, "Either of you can cancel any time with no fee. To cancel, call us, email us, or cancel online in the account settings."),
  (CA, 57, "Okay."),
  (OP, 59, "Our toll-free number is 1-855-464-6872 and our email is support@gogograndparent.com, for cancelling or questions."),
  (CA, 67, "Got it, I have both."),
  (OP, 70, "Our Terms include an arbitration agreement and a class action waiver, so disputes go to individual arbitration, not court."),
  (CA, 78, "Understood."),
  (OP, 81, "Because you're signing up on your mother's behalf, you are also responsible for all fees and charges on the account, jointly with her."),
  (CA, 89, "Yes, I understand I'm responsible for the charges too."),
  (OP, 93, "Can you confirm you have the authority to approve recurring charges on your mother's behalf?"),
  (CA, 99, "Yes. I have power of attorney for her, and I'm authorized to approve the recurring charges."),
  (OP, 106, "The arbitration agreement and class action waiver bind both you and your mother."),
  (CA, 112, "Yes, that's fine."),
  (OP, 115, "And your mother has the right to receive information about the service directly from us at any time, not only through you."),
  (CA, 123, "Good, she'd like that."),
  (OP, 126, "Maya, do you authorize GoGoGrandparent to charge your Mastercard ending in 2290 $59.00 today and every month until it's cancelled?"),
  (CA, 135, "Yes, I authorize it."),
  (OP, 138, "Thank you. We'll send the written confirmation to your email before the first charge."),
]))

# 3. Fee said does not match the plan record
calls.append(build("call_3", "Fee said on the call does not match the plan", "value_monthly", "Walter Briggs", "self",
  {"gate": 409, "summary": "Operator says about twenty a month; the plan record is $34.00 per month. Fee item is a mismatch, first charge held."}, [
  (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
  (CA, 6, "My neighbor uses you. I want to sign up for myself. Walter Briggs."),
  (OP, 12, "Welcome, Walter. GoGo lets you book rides and order groceries and meals by phone, with no smartphone app. You call or text us, we book the ride with a driver service, and we keep an eye on the trip."),
  (CA, 25, "Good. I don't do apps."),
  (OP, 28, "Let me get your address for pickups."),
  (CA, 31, "1180 Orchard Lane, apartment 3."),
  (OP, 36, "And an emergency contact?"),
  (CA, 39, "My son, Peter. I'll give you his number."),
  (OP, 44, "Thank you. And what kind of trips will you take most?"),
  (CA, 49, "Doctor visits mostly. The clinic on Fifth, and the pharmacy. Sometimes church on Sundays."),
  (OP, 58, "We can save those as favorite places so you can just press a number."),
  (CA, 64, "That would help a lot."),
  (OP, 68, "I've saved the clinic, the pharmacy and the church. Now, a few things about the membership."),
  (CA, 98, "Go ahead."),
  (OP, 102, "So the Value plan is about twenty a month, billed monthly."),
  (CA, 108, "Okay, twenty is fine."),
  (OP, 111, "Your membership automatically renews every month unless you cancel."),
  (CA, 116, "Yes, I understand."),
  (OP, 119, "You can cancel any time with no fee. To cancel, call us, email us, or cancel online in your account settings."),
  (CA, 127, "All right."),
  (OP, 129, "Our toll-free number is 1-855-464-6872 and our email is support@gogograndparent.com, for cancelling or any questions."),
  (CA, 138, "Got it."),
  (OP, 140, "Our Terms include an arbitration agreement and a class action waiver, so disputes go to individual arbitration instead of court."),
  (CA, 149, "Understood."),
  (OP, 152, "Walter, do you authorize GoGoGrandparent to charge your Visa ending in 8803 for the Value plan today and every month until you cancel?"),
  (CA, 161, "Yes, I authorize it."),
]))

# 4. Toll-free number never said
calls.append(build("call_4", "Toll-free number never said", "basic_monthly", "Gloria Pratt", "self",
  {"gate": 409, "summary": "Email is given but the toll-free number is never said. Contact item missing, first charge held until a supervisor overrides."}, [
  (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
  (CA, 5, "I saw your ad in the senior center newsletter. I'm Gloria Pratt and I want to join."),
  (OP, 12, "Wonderful, Gloria. GoGo lets you book rides and order groceries and meals by phone, with no smartphone app. You call or text us, we book the ride with a driver service, and we keep an eye on the trip."),
  (CA, 25, "That's what I need."),
  (OP, 28, "The Basic plan is $14.00 per month, billed monthly."),
  (CA, 34, "Yes, $14 a month is fine."),
  (OP, 38, "Your membership automatically renews every month unless you cancel."),
  (CA, 43, "Yes, I understand."),
  (OP, 46, "You can cancel any time with no fee. If you want to cancel, email us at support@gogograndparent.com or cancel online in your account settings."),
  (CA, 56, "Okay, email or online."),
  (OP, 60, "Our Terms include an arbitration agreement and a class action waiver, so disputes go to individual arbitration instead of court."),
  (CA, 69, "Understood."),
  (OP, 72, "Gloria, do you authorize GoGoGrandparent to charge your debit card ending in 5120 $14.00 today and every month until you cancel?"),
  (CA, 81, "Yes, I authorize that."),
  (OP, 84, "Thank you, Gloria. Your written confirmation will come by mail before the first charge."),
]))

# 5. Only "uh-huh" to auto-renewal
calls.append(build("call_5", "Only \"uh-huh\" to auto-renewal", "value_monthly", "Harold Kim", "self",
  {"gate": 409, "summary": "Auto-renewal is said but the only reply is uh-huh. Item marked unclear, first charge held."}, [
  (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
  (CA, 6, "Harold Kim. I want to sign up."),
  (OP, 10, "Glad to help, Harold. GoGo lets you book rides and order groceries and meals by phone, with no smartphone app. You call or text us, we book the ride with a driver service, and we keep an eye on the trip."),
  (CA, 23, "Fine."),
  (OP, 25, "The Value plan is $34.00 per month, billed monthly."),
  (CA, 31, "Yes, thirty-four a month, okay."),
  (OP, 35, "And this renews automatically each month unless you cancel."),
  (CA, 40, "Uh-huh."),
  (OP, 42, "You can cancel any time with no fee. To cancel, call us, email us, or cancel online in your account settings."),
  (CA, 50, "Mm-hmm."),
  (OP, 52, "Our toll-free number is 1-855-464-6872 and our email is support@gogograndparent.com, for cancelling or any questions."),
  (CA, 61, "Okay."),
  (OP, 63, "Our Terms include an arbitration agreement and a class action waiver, so disputes go to individual arbitration instead of court."),
  (CA, 72, "Yeah."),
  (OP, 74, "Harold, do you authorize GoGoGrandparent to charge your Visa ending in 3391 $34.00 today and every month until you cancel?"),
  (CA, 83, "Yes, go ahead and charge it."),
]))

# 6. Annual plan, renewal terms paraphrased but complete
calls.append(build("call_6", "Annual plan, renewal said in plain words", "total_care_annual", "Dolores Reyes", "self",
  {"gate": 200, "summary": "Renewal is paraphrased, not the stock phrase. The model step finds it and the quote is verified word for word. Passes. In rules-only mode this item comes back missing."}, [
  (OP, 0, "Thanks for calling GoGoGrandparent, this is Dana. This call is recorded. How can I help today?"),
  (CA, 6, "Dolores Reyes. I'd like the yearly option for myself."),
  (OP, 11, "Of course, Dolores. GoGo lets you book rides and order groceries and meals by phone, with no smartphone app. You call or text us, we book the ride with a driver service, and we keep an eye on the trip."),
  (CA, 24, "Yes, that's what my friend told me."),
  (OP, 28, "Total Care on the annual option is $480.00 per year, billed once a year."),
  (CA, 35, "Yes, $480 a year is fine."),
  (OP, 39, "When the year is up, your membership carries on into the next year by itself at the same price, and we bill the card again each year until you tell us to stop."),
  (CA, 50, "Yes, that's clear, it keeps going each year till I stop it."),
  (OP, 55, "You can cancel any time with no fee. To cancel, call us, email us, or cancel online in your account settings."),
  (CA, 63, "Good."),
  (OP, 65, "Our toll-free number is 1-855-464-6872 and our email is support@gogograndparent.com, for cancelling or any questions."),
  (CA, 74, "I have it."),
  (OP, 76, "Our Terms include an arbitration agreement and a class action waiver, so disputes go to individual arbitration instead of court."),
  (CA, 85, "Understood."),
  (OP, 88, "Dolores, do you authorize GoGoGrandparent to charge your Visa ending in 6624 $480.00 today and again each year until you cancel?"),
  (CA, 97, "Yes, I authorize that."),
]))

os.makedirs("fixtures/calls", exist_ok=True)
for c in calls:
    with open(f"fixtures/calls/{c['id']}.json", "w") as f:
        json.dump(c, f, indent=2)
        f.write("\n")
print("wrote", len(calls))
