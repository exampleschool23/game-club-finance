update public.new_debts source
set date = source.date - 1
from public.clubs club
where club.id = source.club_id
  and lower(club.name) like '%pixel%'
  and club.business_day_start_hour = 6
  and source.date = (source.created_at at time zone 'Asia/Tashkent')::date
  and extract(hour from source.created_at at time zone 'Asia/Tashkent') < club.business_day_start_hour;

update public.debt_payments source
set date = source.date - 1
from public.clubs club
where club.id = source.club_id
  and lower(club.name) like '%pixel%'
  and club.business_day_start_hour = 6
  and source.date = (source.created_at at time zone 'Asia/Tashkent')::date
  and extract(hour from source.created_at at time zone 'Asia/Tashkent') < club.business_day_start_hour;
